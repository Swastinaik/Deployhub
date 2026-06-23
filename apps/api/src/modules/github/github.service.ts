import { Octokit } from "@octokit/rest";
import { prisma } from "../../db.js";
import { WorkflowRunModel } from "../../models/workflow-run.model.js";
import { BuildLogModel } from "../../models/build-log.model.js";
import type { LogType } from "../../lib/types.js";
import { parseLogsofJob } from "../../lib/utils.js";
import { mapStatus, mapConclusion, parseLogLine } from "../../lib/utils.js";
import axios from "axios";

export async function getJobLogs(
    octokit: Octokit,
    owner: string,
    repo: string,
    jobId: number
) {
    const response =
        await octokit.rest.actions
            .downloadJobLogsForWorkflowRun({
                owner,
                repo,
                job_id: jobId,
            });
    console.log(response.status);
    console.log(response.headers.location);
    console.log(response.data);
    console.log(typeof response.data);

    if (response.data) {
        if (typeof response.data === "string") {
            return response.data;
        }
        if (response.data instanceof ArrayBuffer || Buffer.isBuffer(response.data)) {
            return response.data.toString();
        }
        if (typeof response.data === "object") {
            return JSON.stringify(response.data);
        }
    }

    const url =
        response.headers.location;

    if (!url) {
        throw new Error(
            "Log URL not found"
        );
    }

    const logs =
        await axios.get(url)

    return logs.data;
}

export async function syncWorkflowRunsAndLogsFirstTime(
    octokit: Octokit,
    projectId: string,
    owner: string,
    repo: string
) {
    try {

        // 1. Fetch the recent top 5 runs
        const runsResponse = await octokit.rest.actions.listWorkflowRunsForRepo({
            owner,
            repo,
            status: "completed",
            per_page: 5,
        });

        const workflowRuns = runsResponse.data.workflow_runs || [];

        let latestRunId: string | null = null;

        if (workflowRuns.length > 0) {
            latestRunId = String(workflowRuns[0].id);
            for (const run of workflowRuns) {
                if (run.status === "completed") {
                    const durationSeconds = run.updated_at && run.run_started_at
                        ? Math.round((new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()) / 1000)
                        : undefined;

                    await WorkflowRunModel.findOneAndUpdate(
                        { githubRunId: run.id },
                        {
                            $set: {
                                projectId,
                                githubRunId: run.id,
                                workflowName: run.name || "Unnamed Workflow",
                                branch: run.head_branch || "main",
                                status: mapStatus(run.status),
                                conclusion: mapConclusion(run.conclusion),
                                commitSha: run.head_sha,
                                commitMessage: run.head_commit?.message || "No commit message",
                                actor: run.actor?.login || "unknown",
                                startedAt: run.run_started_at ? new Date(run.run_started_at) : new Date(),
                                completedAt: run.updated_at ? new Date(run.updated_at) : undefined,
                                durationSeconds,
                            },
                        },
                        { upsert: true, new: true }
                    );

                    await BuildLogModel.deleteMany({ workflowRunId: run.id });
                    const logs = await fetchLogsForCompletedRuns(octokit, run.id, repo, owner);
                    await saveLogstoDB(logs);
                }
            }

            // 2. Update Prisma Schema: set lastSynced to true, latestRunId, and lastSyncedAt
            await prisma.project.update({
                where: { id: projectId },
                data: {
                    lastSynced: true,
                    lastSyncedAt: new Date(),
                    latestRunId: latestRunId,
                },
            });
            console.log(`Successfully synced workflow runs and logs for project ${projectId}`);
        }
    } catch (error: any) {
        console.error(`Failed to sync workflow runs and logs for ${owner}/${repo}:`, error.message);
        throw error;
    }
}

export async function syncLatestWorkflowRuns(
    octokit: Octokit,
    projectId: string,
    owner: string,
    repo: string
) {
    try {
        // 1. Fetch the current project record to get the stored latestRunId
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { latestRunId: true, lastSynced: true },
        });

        if (!project) {
            throw new Error(`Project ${projectId} not found in database`);
        }

        // 2. If this project has never been synced at all, do a full first-time sync
        if (!project.lastSynced) {
            console.log(`Project ${projectId} has never been synced. Falling back to first-time sync.`);
            await syncWorkflowRunsAndLogsFirstTime(octokit, projectId, owner, repo);
            return
        }

        const storedLatestRunId = project.latestRunId ? Number(project.latestRunId) : null;

        // 3. Fetch recent runs from GitHub (iterate and check against completed runs in DB)
        let page = 1;
        const PER_PAGE = 20;
        const newRuns: any[] = [];
        let newLatestRunId = project.latestRunId;

        outer: while (true) {
            const runsResponse = await octokit.rest.actions.listWorkflowRunsForRepo({
                owner,
                repo,
                status: "completed",
                per_page: PER_PAGE,
                page,
            });

            const workflowRuns = runsResponse.data.workflow_runs || [];
            if (workflowRuns.length === 0) break;

            if (page === 1 && workflowRuns.length > 0) {
                const highestOnPage = Number(workflowRuns[0].id);
                if (storedLatestRunId === null || highestOnPage > storedLatestRunId) {
                    newLatestRunId = String(highestOnPage);
                }
            }

            const runIds = workflowRuns.map((r: any) => r.id);
            const completedRunsInDB = await WorkflowRunModel.find({
                githubRunId: { $in: runIds },
                status: "completed"
            }, { githubRunId: 1 });

            const completedSet = new Set(completedRunsInDB.map(r => r.githubRunId));

            let allPageRunsCompleted = true;
            for (const run of workflowRuns) {
                if (completedSet.has(run.id)) {
                    continue;
                }
                allPageRunsCompleted = false;
                newRuns.push(run);
            }

            if (allPageRunsCompleted) {
                break;
            }

            if (workflowRuns.length < PER_PAGE) break;
            page++;
        }

        if (newRuns.length === 0) {
            console.log(`No new workflow runs found for project ${projectId} (${owner}/${repo})`);
            // Still update lastSyncedAt to track when we last checked
            await prisma.project.update({
                where: { id: projectId },
                data: { lastSyncedAt: new Date() },
            });
            return;
        }

        console.log(`Found ${newRuns.length} new workflow run(s) for project ${projectId}. Syncing...`);

        // 4. Persist each new run and its logs (same logic as first-time sync)
        for (const run of newRuns) {
            const durationSeconds =
                run.updated_at && run.run_started_at
                    ? Math.round(
                        (new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()) / 1000
                    )
                    : undefined;

            await WorkflowRunModel.findOneAndUpdate(
                { githubRunId: run.id },
                {
                    $set: {
                        projectId,
                        githubRunId: run.id,
                        workflowName: run.name || "Unnamed Workflow",
                        branch: run.head_branch || "main",
                        status: mapStatus(run.status),
                        conclusion: mapConclusion(run.conclusion),
                        commitSha: run.head_sha,
                        commitMessage: run.head_commit?.message || "No commit message",
                        actor: run.actor?.login || "unknown",
                        startedAt: run.run_started_at ? new Date(run.run_started_at) : new Date(),
                        completedAt: run.updated_at ? new Date(run.updated_at) : undefined,
                        durationSeconds,
                    },
                },
                { upsert: true, new: true }
            );

            await BuildLogModel.deleteMany({ workflowRunId: run.id });
            const logs = await fetchLogsForCompletedRuns(octokit, run.id, repo, owner);
            await saveLogstoDB(logs);

        }

        // 5. Update the project's latestRunId and lastSyncedAt in Prisma
        await prisma.project.update({
            where: { id: projectId },
            data: {
                latestRunId: newLatestRunId,
                lastSyncedAt: new Date(),
            },
        });


        console.log(
            `Incremental sync complete for project ${projectId}: ${newRuns.length} new run(s) saved. Latest run ID: ${newLatestRunId}`
        );
    } catch (error) {
        throw error
    }
}

export async function saveLogstoDB(logs: LogType[]) {
    try {
        await BuildLogModel.insertMany(logs);
    } catch (error: any) {
        console.error(`[saveLogstoDB] Failed to save logs:`, error.message);
    }
}

export async function fetchLogsForInProgressRuns(octokit: Octokit, runId: number, repo: string, owner: string) {
    try {
        const workflowRun = await WorkflowRunModel.findOne({ githubRunId: runId });
        if (!workflowRun) {
            console.warn(`[fetchBuildLogs] WorkflowRun not found for githubRunId ${runId}. Skipping log save to avoid duplicates.`);
            return [];
        }
        const jobLogOffsets = workflowRun.jobLogOffsets || new Map<string, number>();

        const jobsResponse = await octokit.rest.actions.listJobsForWorkflowRun({
            owner,
            repo,
            run_id: runId
        });

        const jobs = jobsResponse.data.jobs || [];

        const latestLogs: LogType[] = [];
        const updatedOffsets = new Map<string, number>();

        for (const job of jobs) {
            if (job.status === "queued") {
                continue;
            }
            try {
                const logsText = await getJobLogs(octokit, owner, repo, job.id);

                if (logsText && logsText.length > 0) {
                    const jobLogs: LogType[] = [];
                    parseLogsofJob(logsText, job, jobLogs, runId);

                    const jobKey = String(job.id);
                    const lastFetched = (jobLogOffsets instanceof Map)
                        ? (jobLogOffsets.get(jobKey) || 0)
                        : ((jobLogOffsets as any)?.[jobKey] || 0);

                    const newJobLogs = jobLogs.slice(lastFetched);
                    latestLogs.push(...newJobLogs);

                    updatedOffsets.set(jobKey, jobLogs.length);
                } else {
                    console.error(`Failed to sync logs for job ${job.id}:`);
                }
            } catch (jobLogError: any) {
                console.error(`Failed to fetch logs for job ${job.id}:`, jobLogError.message);
            }
        }

        await WorkflowRunModel.updateOne(
            { githubRunId: runId },
            {
                $set: {
                    jobLogOffsets: updatedOffsets,
                    lastLogSyncAt: new Date(),
                },
            }
        );

        return latestLogs;
    } catch (error) {
        throw error
    }
}

export async function fetchLogsForCompletedRuns(octokit: Octokit, runId: number, repo: string, owner: string) {
    try {

        const jobsResponse = await octokit.rest.actions.listJobsForWorkflowRun({
            owner,
            repo,
            run_id: runId
        })

        const jobs = jobsResponse.data.jobs || [];

        const allCandidateLines: LogType[] = [];
        for (const job of jobs) {
            if (job.status === "queued") {
                continue;
            }
            try {
                const logsText = await getJobLogs(octokit, owner, repo, job.id);

                if (logsText && logsText.length > 0) {
                    parseLogsofJob(logsText, job, allCandidateLines, runId)
                } else {
                    console.error(`Failed to sync logs for job ${job.id}:`);
                }
            } catch (jobLogError: any) {
                console.error(`Failed to fetch logs for job ${job.id}:`, jobLogError.message);
            }
        }
        return allCandidateLines;



    } catch (error) {
        throw error
    }
}