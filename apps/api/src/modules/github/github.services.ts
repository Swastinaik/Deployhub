import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../../db.js";
import { getSocketManager } from "../sockets/socket.service.js";
import { WorkflowRunModel } from "../../models/workflow-run.model.js";
import { WorkflowJobModel } from "../../models/workflow-job.model.js";
import { mapStatus, mapConclusion } from "../../lib/utils.js";
import { getOctokitForUser } from "../auth/auth.utils.js";
import { getGithubUserEmails } from "../auth/github.service.js";
import { enqueueAlert } from "../queues/alert.queue.js";



// Verify GitHub signatures for incoming webhooks
export function verifyGitHubSignature(req: Request, res: Response, next: NextFunction) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    console.error("FATAL: WEBHOOK_SECRET is not defined.");
    return res.status(500).send("Server configuration error.");
  }

  const signatureHeader = req.headers["x-hub-signature-256"];
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return res.status(401).send("Missing signature header.");
  }

  if (!signatureHeader.startsWith("sha256=")) {
    return res.status(401).send("Invalid signature format.");
  }
  const signature = signatureHeader.slice(7);

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    console.error("Raw body missing. Ensure verify option is set on express.json()");
    return res.status(500).send("Raw body not captured.");
  }

  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  const digest = hmac.update(rawBody).digest("hex");

  const sigBuffer = Buffer.from(signature);
  const digBuffer = Buffer.from(digest);

  if (sigBuffer.length !== digBuffer.length) {
    return res.status(401).send("Invalid signature.");
  }

  if (crypto.timingSafeEqual(sigBuffer, digBuffer)) {
    return next();
  } else {
    return res.status(401).send("Signature match failed.");
  }
}

// Helper to upsert project and owner link
export async function upsertProjectAndMember(
  repo: { id: number; name: string; full_name: string },
  installationId: number,
  installerId: string | null
) {
  const existing = await prisma.project.findFirst({
    where: { github_repo_id: repo.id },
  });

  let project;
  if (existing) {
    project = await prisma.project.update({
      where: { id: existing.id },
      data: {
        repo_name: repo.name,
        repo_full_name: repo.full_name,
        installation_id: Number(installationId),
        is_active: true,
      },
    });
  } else {
    project = await prisma.project.create({
      data: {
        github_repo_id: repo.id,
        repo_name: repo.name,
        repo_full_name: repo.full_name,
        installation_id: Number(installationId),
        is_active: true,
      },
    });
  }

  if (installerId) {
    const isMember = await prisma.projectMember.findFirst({
      where: {
        userId: installerId,
        projectId: project.id,
      },
    });
    if (!isMember) {
      await prisma.projectMember.create({
        data: {
          userId: installerId,
          projectId: project.id,
          role: "OWNER",
        },
      });
    }
  }

  return project;
}

// 1. Process Installation Event
export async function handleInstallationEvent(payload: any): Promise<void> {
  console.log("Installation event started")
  const action = payload.action;
  const installationId = payload.installation?.id;
  if (!installationId) {
    console.warn(`[GitHub Webhook] No installation ID found`);
    return;
  }

  let installerId: string | null = null;
  if (payload.sender?.id) {
    const user = await prisma.user.findUnique({
      where: { githubId: String(payload.sender.id) },
    });
    if (user) {
      installerId = user.id;
    }
  }

  if (action === "created") {
    console.log("Installation created")
    await prisma.githubInstallations.upsert({
      where: { id: Number(installationId) },
      create: {
        id: Number(installationId),
        target_id: Number(payload.installation.account.id),
        target_type: payload.installation.account.type,
        account_name: payload.installation.account.login,
        sender_github_id: Number(payload.sender.id),
      },
      update: {
        target_id: Number(payload.installation.account.id),
        target_type: payload.installation.account.type,
        account_name: payload.installation.account.login,
        sender_github_id: Number(payload.sender.id),
      },
    });

    if (payload.repositories && Array.isArray(payload.repositories)) {
      for (const repo of payload.repositories) {
        await upsertProjectAndMember(repo, Number(installationId), installerId);
      }
    }
  }

  if (action === "deleted") {
    await prisma.githubInstallations.deleteMany({
      where: { id: Number(installationId) },
    });
  }
}

// 2. Process Installation Repositories Event
export async function handleInstallationRepositoriesEvent(payload: any): Promise<void> {
  const action = payload.action;
  const installationId = payload.installation?.id;
  if (!installationId) return;

  let installerId: string | null = null;
  if (payload.sender?.id) {
    const user = await prisma.user.findUnique({
      where: { githubId: String(payload.sender.id) },
    });
    if (user) {
      installerId = user.id;
    }
  }

  if (action === "added" && payload.repositories_added && Array.isArray(payload.repositories_added)) {
    for (const repo of payload.repositories_added) {
      await upsertProjectAndMember(repo, Number(installationId), installerId);
    }
  }

  if (action === "removed" && payload.repositories_removed && Array.isArray(payload.repositories_removed)) {
    for (const repo of payload.repositories_removed) {
      const repoId = Number(repo.id);
      await prisma.project.updateMany({
        where: { github_repo_id: repoId },
        data: { is_active: false },
      });
    }
  }
}

// 3. Process Workflow Run Event (Telemetries & Sockets)
export async function handleWorkflowRunEvent(payload: any): Promise<void> {
  const repoId = payload.repository?.id;
  if (!repoId) return;

  const project = await prisma.project.findFirst({
    where: { github_repo_id: Number(repoId) },
  });
  const isTracked = project && project.is_active;
  if (!isTracked) return;

  const socketManager = getSocketManager();
  const runPayload = payload.workflow_run;

  const durationSec = runPayload.updated_at && runPayload.run_started_at
    ? Math.round((new Date(runPayload.updated_at).getTime() - new Date(runPayload.run_started_at).getTime()) / 1000)
    : 0;

  // Persist to MongoDB
  await WorkflowRunModel.findOneAndUpdate(
    { githubRunId: runPayload.id },
    {
      projectId: project.id,
      githubRunId: runPayload.id,
      workflowName: runPayload.name || "Workflow",
      branch: runPayload.head_branch || "main",
      status: runPayload.status,
      conclusion: runPayload.conclusion,
      commitSha: runPayload.head_commit?.id || "",
      commitMessage: runPayload.head_commit?.message || "",
      actor: runPayload.actor?.login || "",
      startedAt: runPayload.run_started_at ? new Date(runPayload.run_started_at) : new Date(runPayload.created_at),
      completedAt: runPayload.status === "completed" ? new Date(runPayload.updated_at) : undefined,
      duration: durationSec,
    },
    { upsert: true, new: true }
  );

  const workflowData = {
    eventType: "workflow_run",
    runId: runPayload.id,
    status: runPayload.status,
    conclusion: runPayload.conclusion,
    updatedAt: runPayload.updated_at,
    workflowName: runPayload.name,
    branch: runPayload.head_branch,
    commitSha: runPayload.head_commit?.id || "",
    commitMessage: runPayload.head_commit?.message || "",
    actor: runPayload.actor?.login || "",
    startedAt: runPayload.run_started_at || runPayload.created_at,
    duration: durationSec,
  };

  socketManager.broadcastWorkflowEvent(repoId, workflowData);

  // Trigger alert if workflow run completed with failure
  if (runPayload.status === "completed" && mapConclusion(runPayload.conclusion) === "failure") {
    await triggerWorkflowFailureAlert(project, {
      id: runPayload.id,
      name: runPayload.name || "Workflow",
      branch: runPayload.head_branch || "main",
      conclusion: runPayload.conclusion,
      html_url: runPayload.html_url,
      actor: runPayload.actor?.login || "",
      commitSha: runPayload.head_commit?.id || "",
      commitMessage: runPayload.head_commit?.message || "",
    });
  }
}

export async function triggerWorkflowFailureAlert(
  project: { id: string; repo_full_name: string },
  run: {
    id: number | string;
    name?: string;
    branch?: string;
    conclusion?: string | null;
    html_url?: string;
    actor?: string;
    commitSha?: string;
    commitMessage?: string;
  }
): Promise<void> {
  try {
    const members = await prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: true },
    });

    const recipientEmailSet = new Set<string>();

    for (const member of members) {
      if (member.user?.email && member.user.email.trim()) {
        recipientEmailSet.add(member.user.email.trim());
      } else if (member.user?.githubAccessToken) {
        // Fallback: If user email is not yet in DB, fetch from GitHub and update DB
        try {
          const fetchedEmail = await getGithubUserEmails(member.user.githubAccessToken);
          if (fetchedEmail) {
            recipientEmailSet.add(fetchedEmail);
            await prisma.user.update({
              where: { id: member.user.id },
              data: { email: fetchedEmail },
            });
          }
        } catch (fetchErr: any) {
          console.warn(`[Alert Queue] Could not fetch email for user ${member.user.id}:`, fetchErr.message);
        }
      }
    }

    const recipientEmails = Array.from(recipientEmailSet);

    if (recipientEmails.length === 0) {
      console.warn(
        `[Alert Queue] No recipient emails found for project members in project ${project.id} (${project.repo_full_name})`
      );
      return;
    }

    const workflowName = run.name || "Workflow";
    const branch = run.branch || "main";
    const runId = run.id;
    const runUrl =
      run.html_url || `https://github.com/${project.repo_full_name}/actions/runs/${runId}`;

    for (const email of recipientEmails) {
      await enqueueAlert({
        channel: "email",
        recipient: email,
        title: `Workflow Failure: ${workflowName}`,
        message: `Workflow "${workflowName}" for repository ${project.repo_full_name} on branch "${branch}" has failed.`,
        metadata: {
          runId,
          repo: project.repo_full_name,
          runUrl,
          branch,
          actor: run.actor || "",
          commitSha: run.commitSha || "",
          commitMessage: run.commitMessage || "",
          conclusion: run.conclusion || "failure",
        },
      });
    }
  } catch (err: any) {
    console.error(`[Alert Queue] Failed to enqueue alert:`, err.message || err);
  }
}

// 4. Process Workflow Job Event (Telemetries & Sockets)
export async function fetchAndExtractFailedLogs(
  octokit: any,
  owner: string,
  repo: string,
  jobId: number | string,
  failedStepNames: string[]
): Promise<Record<string, string[]> | null> {
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs",
      {
        owner,
        repo,
        job_id: Number(jobId),
      }
    );

    let fullLogText = "";
    if (typeof response.data === "string") {
      fullLogText = response.data;
    } else if (response.data instanceof ArrayBuffer) {
      const decoder = new TextDecoder("utf-8");
      fullLogText = decoder.decode(response.data);
    } else if (Buffer.isBuffer(response.data)) {
      fullLogText = response.data.toString("utf-8");
    } else if (response.data) {
      fullLogText = JSON.stringify(response.data);
    }

    if (!fullLogText) {
      return null;
    }

    const lines = fullLogText.split("\n");
    const result: Record<string, string[]> = {};

    for (const stepName of failedStepNames) {
      // Try to parse logs inside groups first: ##[group]Step Name ... ##[endgroup]
      let groupLogs: string[] = [];
      let inGroup = false;

      for (const line of lines) {
        if (line.includes("##[group]")) {
          const groupTitle = line.split("##[group]")[1]?.trim().toLowerCase() || "";
          if (groupTitle.includes(stepName.toLowerCase()) || stepName.toLowerCase().includes(groupTitle)) {
            inGroup = true;
          } else {
            inGroup = false;
          }
          continue;
        }
        if (line.includes("##[endgroup]")) {
          inGroup = false;
          continue;
        }
        if (inGroup) {
          groupLogs.push(line);
        }
      }

      // Fallback to text matching if group parsing returned no logs
      if (groupLogs.length === 0) {
        const stepLogs = lines.filter(
          (line) => line.includes(`[${stepName}]`) || line.includes(stepName)
        );
        groupLogs = stepLogs.length > 0 ? stepLogs : lines;
      }

      // Take last 20 lines of the failure
      result[stepName] = groupLogs.slice(-20);
    }

    return result;
  } catch (error: any) {
    console.error("Failed to parse logs from GitHub:", error.message || error);
    return null;
  }
}

export async function handleWorkflowJobEvent(payload: any): Promise<void> {
  const repoId = payload.repository?.id;
  if (!repoId) return;

  const project = await prisma.project.findFirst({
    where: { github_repo_id: Number(repoId) },
  });
  const isTracked = project && project.is_active;
  if (!isTracked) return;

  const socketManager = getSocketManager();
  const jobPayload = payload.workflow_job;

  let errorLogs: Record<string, string[]> | undefined = undefined;

  if (payload.action === "completed" && jobPayload.conclusion === "failure") {
    // Find all steps that crashed
    const failedSteps = jobPayload.steps?.filter((step: any) => step.conclusion === "failure") || [];

    if (failedSteps.length > 0) {
      const failedStepNames = failedSteps.map((s: any) => s.name);
      console.log(`Failed steps in job ${jobPayload.name}:`, failedStepNames);

      try {
        const member = await prisma.projectMember.findFirst({
          where: { projectId: project.id },
          include: { user: true },
        });

        const token = member?.user?.githubAccessToken;
        if (token) {
          const octokit = getOctokitForUser(token);
          const [owner, repo] = project.repo_full_name.split("/");
          const logs = await fetchAndExtractFailedLogs(
            octokit,
            owner,
            repo,
            jobPayload.id,
            failedStepNames
          );
          if (logs) {
            errorLogs = logs;
          }
        }
      } catch (err: any) {
        console.error("Error retrieving user token for fetching failed logs:", err.message || err);
      }
    }
  }

  // Persist to MongoDB
  await WorkflowJobModel.findOneAndUpdate(
    { githubJobId: jobPayload.id },
    {
      githubJobId: jobPayload.id,
      githubRunId: jobPayload.run_id,
      projectId: project.id,
      name: jobPayload.name,
      status: jobPayload.status,
      conclusion: jobPayload.conclusion,
      runnerName: jobPayload.runner_name || null,
      startedAt: jobPayload.started_at ? new Date(jobPayload.started_at) : undefined,
      completedAt: jobPayload.completed_at ? new Date(jobPayload.completed_at) : undefined,
      steps: jobPayload.steps.map((step: any) => ({
        number: step.number,
        name: step.name,
        status: step.status,
        conclusion: step.conclusion,
        startedAt: step.started_at,
        completedAt: step.completed_at,
      })),
      ...(errorLogs ? { errorLogs } : {}),
    },
    { upsert: true, new: true }
  );

  const jobData = {
    eventType: "workflow_job",
    action: payload.action,
    jobId: jobPayload.id,
    runId: jobPayload.run_id,
    jobName: jobPayload.name,
    status: jobPayload.status,
    conclusion: jobPayload.conclusion,
    steps: jobPayload.steps.map((step: any) => ({
      number: step.number,
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
    })),
    ...(errorLogs ? { errorLogs } : {}),
  };

  socketManager.broadcastJobEvent(repoId, jobData);
}

export async function syncLatestWorkflowRuns(
  octokit: any,
  projectId: string,
  owner: string,
  repo: string
) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found in database`);
    }

    const storedLatestRunId = project.latestRunId ? Number(project.latestRunId) : null;

    let page = 1;
    const PER_PAGE = 20;
    const newRuns: any[] = [];
    let newLatestRunId = storedLatestRunId;

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
          newLatestRunId = highestOnPage;
        }
      }

      const runIds = workflowRuns.map((r: any) => r.id);
      const completedRunsInDB = await WorkflowRunModel.find({
        githubRunId: { $in: runIds },
        status: "completed",
      }, { githubRunId: 1 });

      const completedSet = new Set(completedRunsInDB.map((r) => r.githubRunId));

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
      return;
    }

    console.log(`Found ${newRuns.length} new workflow run(s) for project ${projectId}. Syncing...`);

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
            commitSha: run.head_commit?.id || run.head_sha || "",
            commitMessage: run.head_commit?.message || "No commit message",
            actor: run.actor?.login || "unknown",
            startedAt: run.run_started_at ? new Date(run.run_started_at) : new Date(),
            completedAt: run.updated_at ? new Date(run.updated_at) : undefined,
            durationSeconds,
            duration: durationSeconds,
          },
        },
        { upsert: true, new: true }
      );

      if (run.status === "completed" && mapConclusion(run.conclusion) === "failure") {
        await triggerWorkflowFailureAlert(project, {
          id: run.id,
          name: run.name || "Unnamed Workflow",
          branch: run.head_branch || "main",
          conclusion: run.conclusion,
          html_url: run.html_url,
          actor: run.actor?.login || "unknown",
          commitSha: run.head_commit?.id || run.head_sha || "",
          commitMessage: run.head_commit?.message || "No commit message",
        });
      }
    }

    if (newLatestRunId !== null && (storedLatestRunId === null || newLatestRunId > storedLatestRunId)) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          latestRunId: BigInt(newLatestRunId),
        },
      });
    }

    console.log(
      `Incremental sync complete for project ${projectId}: ${newRuns.length} new run(s) saved. Latest run ID: ${newLatestRunId}`
    );
  } catch (error) {
    throw error;
  }
}

