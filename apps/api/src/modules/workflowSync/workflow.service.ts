import { Octokit } from "@octokit/rest";
import { WorkflowRunModel } from "../../models/workflow-run.model.js";
import { mapStatus, mapConclusion } from "../../lib/utils.js";
import { WorkflowRunType } from "../../lib/types.js";
import { SocketManager } from "../sockets/socketManager.js";
import { LogPoll } from "./pollers/log.poller.js";
import { fetchLogsForCompletedRuns, fetchLogsForInProgressRuns, saveLogstoDB } from "../github/github.service.js";

export async function workflowSync(
    octokit: Octokit,
    repo: string,
    projectId: string,
    owner: string,
    clearPoll: () => void,
    logpoll: LogPoll,
    socket: SocketManager
) {
    try {
        if (socket.getRoomSize(projectId) === 0) {
            clearPoll();
            return;
        }

        const runningWorkflows = await octokit.rest.actions.listWorkflowRunsForRepo({
            owner,
            repo,
            status: "in_progress",
            per_page: 5
        })
        const workflows = runningWorkflows.data.workflow_runs
        console.log(" workflows in workflowSync ", workflows)
        if (workflows.length > 0) {

            for (let workflow of workflows) {
                const workflowInDB = await WorkflowRunModel.findOne({
                    githubRunId: workflow.id
                })

                if (!workflowInDB) {

                    const durationSeconds = workflow.updated_at && workflow.run_started_at
                        ? Math.round((new Date(workflow.updated_at).getTime() - new Date(workflow.run_started_at).getTime()) / 1000)
                        : undefined;

                    await WorkflowRunModel.create({
                        githubRunId: workflow.id,
                        projectId,
                        workflowName: workflow.name || "Unnamed Workflow",
                        branch: workflow.head_branch || "main",
                        commitSha: workflow.head_sha,
                        commitMessage: workflow.head_commit?.message || "No commit message",
                        actor: workflow.actor?.login || "unknown",
                        startedAt: workflow.run_started_at ? new Date(workflow.run_started_at) : new Date(),
                        completedAt: workflow.updated_at ? new Date(workflow.updated_at) : undefined,
                        durationSeconds,
                        status: mapStatus(workflow.status),
                        conclusion: mapConclusion(workflow.conclusion),
                        jobLogOffsets: {},
                        lastLogSyncAt: new Date()
                    })

                    console.log("new workflow created ")

                    const workflowInSocket: WorkflowRunType = {
                        githubRunId: workflow.id,
                        workflowName: workflow.name || "Unnamed Workflow",
                        branch: workflow.head_branch || "main",
                        commitSha: workflow.head_sha,
                        commitMessage: workflow.head_commit?.message || "No commit message",
                        actor: workflow.actor?.login || "unknown",
                        startedAt: workflow.run_started_at ? new Date(workflow.run_started_at) : new Date(),
                        completedAt: workflow.updated_at ? new Date(workflow.updated_at) : undefined,
                        durationSeconds: durationSeconds ?? 0,
                        status: mapStatus(workflow.status),
                        conclusion: mapConclusion(workflow.conclusion),

                    }
                    socket.broadcastWorkflowSync(projectId, workflowInSocket)

                }
                console.log(" workflow started for logs ", projectId)

                logpoll.ensureLogPoll(workflow.id, octokit, repo, socket, owner, projectId)
            }
        }
    } catch (error) {
        throw error
    }
}

export async function logSync(
    octokit: Octokit,
    socket: SocketManager,
    clearInterval: (runId: number) => void,
    repo: string,
    owner: string,
    runId: number,
    projectId: string
) {
    try {
        const workflowResponse = await octokit.rest.actions.getWorkflowRun({
            owner,
            repo,
            run_id: runId
        })
        if (workflowResponse.data.status === "completed") {
            // Bug 1 fix: fetch the final batch of logs BEFORE clearing the poller so
            // any lines that arrived in the last tick are persisted and broadcast.
            const finalLogLines = await fetchLogsForInProgressRuns(octokit, runId, repo, owner)
            if (finalLogLines.length > 0) {
                socket.broadcastWorkflowLogs(projectId, finalLogLines)
            }
            const logs = await fetchLogsForCompletedRuns(octokit, runId, repo, owner);
            await saveLogstoDB(logs)

            const durationSeconds = workflowResponse.data.updated_at && workflowResponse.data.run_started_at
                ? Math.round((new Date(workflowResponse.data.updated_at).getTime() - new Date(workflowResponse.data.run_started_at).getTime()) / 1000)
                : undefined;

            await WorkflowRunModel.updateOne({
                githubRunId: runId
            }, {
                $set: {
                    status: "completed",
                    // Bug 6 fix: persist the final conclusion and completedAt so these
                    // fields are not left in their initial/stale state after a run ends.
                    conclusion: mapConclusion(workflowResponse.data.conclusion),
                    completedAt: workflowResponse.data.updated_at
                        ? new Date(workflowResponse.data.updated_at)
                        : new Date(),
                    durationSeconds,
                }
            })
            clearInterval(runId)
        } else {
            const logLines = await fetchLogsForInProgressRuns(
                octokit,
                runId,
                repo,
                owner
            )
            if (logLines.length > 0) {
                socket.broadcastWorkflowLogs(projectId, logLines)
            }
        }

    } catch (error) {
        console.error(`[logSync] Error syncing logs for runId ${runId}:`, error);
    }
}


