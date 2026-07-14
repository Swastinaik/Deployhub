import { Request, Response } from "express";
import { prisma } from "../../db.js";
import { AuthedRequest } from "../auth/auth.middleware.js";
import { WorkflowRunModel } from "../../models/workflow-run.model.js";
import { WorkflowJobModel } from "../../models/workflow-job.model.js";
import {
  handleInstallationEvent,
  handleInstallationRepositoriesEvent,
  handleWorkflowRunEvent,
  handleWorkflowJobEvent,
  syncLatestWorkflowRuns,
} from "./github.services.js";

export async function handleGithubWebhook(req: Request, res: Response): Promise<void> {
  const eventType = req.headers["x-github-event"];
  const payload = req.body;

  // We respond with a 200 immediately to keep GitHub happy
  res.status(200).send("Accepted");
  console.log("Start")
  Promise.resolve().then(async () => {
    try {
      switch (eventType) {
        case "installation":
          await handleInstallationEvent(payload);
          break;
        case "installation_repositories":
          await handleInstallationRepositoriesEvent(payload);
          break;
        case "workflow_run":
          await handleWorkflowRunEvent(payload);
          break;
        case "workflow_job":
          await handleWorkflowJobEvent(payload);
          break;
        default:
          console.log(`[GitHub Webhook] Unhandled event type: ${eventType}`);
      }
    } catch (err: any) {
      console.error(`[GitHub Webhook] Error processing event ${eventType}:`, err.message || err);
    }
  });
}

export async function verifyInstallation(req: Request, res: Response): Promise<Response> {
  const { installation_id } = req.query;

  if (!installation_id) {
    return res.status(400).json({ error: "Missing installation_id" });
  }

  try {
    const repos = await prisma.project.findMany({
      where: { installation_id: Number(installation_id) },
    });

    if (repos && repos.length > 0) {
      return res.status(200).json({ status: "ready", repositories: repos });
    } else {
      return res.status(200).json({ status: "pending" });
    }
  } catch (err: any) {
    console.error(`[GitHub Webhook Verify] Error:`, err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function getUserRepositoriesFromDb(req: AuthedRequest, res: Response): Promise<Response> {
  try {
    const projects = await prisma.project.findMany({
      where: {
        projectMembers: {
          some: {
            userId: req.userId,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    return res.status(200).json({ status: "success", data: projects });
  } catch (err: any) {
    console.error(`[User Repositories] Error fetching projects:`, err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function getRepositoryDetailById(req: AuthedRequest, res: Response): Promise<Response> {
  const { projectId } = req.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({ status: "error", message: "Project not found" });
    }

    if (!req.octokit) {
      return res.status(401).json({ status: "error", message: "GitHub client not initialized" });
    }

    let repoResponse;
    try {
      repoResponse = await req.octokit.request("GET /repositories/{id}", {
        id: Number(project.github_repo_id),
      });
    } catch (gitErr: any) {
      console.error(`[GitHub Sync] Error fetching repo details from GitHub:`, gitErr.message);
      return res.status(404).json({
        status: "error",
        message: "Repository not found on GitHub or access denied",
      });
    }

    const repoDetails = repoResponse.data;
    const owner = repoDetails.owner.login;
    const repoName = repoDetails.name;

    // Sync latest actions/workflows from GitHub using the new service function
    try {
      await syncLatestWorkflowRuns(req.octokit, project.id, owner, repoName);
    } catch (syncErr: any) {
      console.error(`[GitHub Sync] Incremental workflow run sync failed:`, syncErr.message);
    }

    // Fetch the top 5 runs from MongoDB
    const recentRuns = await WorkflowRunModel.find({ projectId: project.id })
      .sort({ startedAt: -1 })
      .limit(5)
      .lean();

    return res.status(200).json({
      status: "success",
      data: {
        id: project.id,
        name: project.repo_name,
        githubRepoOwner: owner,
        githubRepoName: repoName,
        defaultBranch: repoDetails.default_branch || "main",
        visibility: repoDetails.private ? "PRIVATE" : "PUBLIC",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        repoResponse: repoDetails,
        recentWorkflowRuns: recentRuns.map((run) => ({
          githubRunId: run.githubRunId,
          workflowName: run.workflowName,
          branch: run.branch,
          commitSha: run.commitSha,
          commitMessage: run.commitMessage,
          actor: run.actor,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          durationSeconds: run.duration || 0,
          status: run.status,
          conclusion: run.conclusion || undefined,
        })),
      },
    });
  } catch (err: any) {
    console.error(`[Project Details] Error loading project:`, err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}



export async function getWorkflowRunJobs(req: AuthedRequest, res: Response): Promise<Response> {
  const { projectId, runId } = req.params;

  try {
    // 1. Check if run exists
    const run = await WorkflowRunModel.findOne({
      projectId,
      githubRunId: Number(runId),
    }).lean();

    if (!run) {
      return res.status(404).json({ status: "error", message: "Workflow run not found" });
    }

    // 2. Check if jobs exist
    let jobs = await WorkflowJobModel.find({
      projectId,
      githubRunId: Number(runId),
    })
      .sort({ startedAt: 1 })
      .lean();

    // 3. If no jobs exist, fetch from GitHub and save
    if (jobs.length === 0) {
      if (!req.octokit) {
        return res.status(401).json({ status: "error", message: "GitHub client not initialized" });
      }

      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return res.status(404).json({ status: "error", message: "Project not found" });
      }

      const [owner, repoName] = project.repo_full_name.split("/");

      try {
        const jobsResponse = await req.octokit.rest.actions.listJobsForWorkflowRun({
          owner,
          repo: repoName,
          run_id: Number(runId),
        });

        const githubJobs = jobsResponse.data.jobs || [];

        for (const job of githubJobs) {
          await WorkflowJobModel.findOneAndUpdate(
            { githubJobId: job.id },
            {
              githubJobId: job.id,
              githubRunId: Number(runId),
              projectId: project.id,
              name: job.name,
              status: job.status,
              conclusion: job.conclusion,
              runnerName: job.runner_name || null,
              startedAt: job.started_at ? new Date(job.started_at) : undefined,
              completedAt: job.completed_at ? new Date(job.completed_at) : undefined,
              steps: (job.steps || []).map((step: any) => ({
                number: step.number,
                name: step.name,
                status: step.status,
                conclusion: step.conclusion || null,
                startedAt: step.started_at ? new Date(step.started_at) : undefined,
                completedAt: step.completed_at ? new Date(step.completed_at) : undefined,
              })),
            },
            { upsert: true, new: true }
          );
        }

        // Retrieve the newly created jobs from database
        jobs = await WorkflowJobModel.find({
          projectId,
          githubRunId: Number(runId),
        })
          .sort({ startedAt: 1 })
          .lean();
      } catch (gitErr: any) {
        console.error(`[Workflow Run Jobs] Error fetching jobs from GitHub:`, gitErr.message);
        return res.status(500).json({ error: `Failed to fetch jobs from GitHub: ${gitErr.message}` });
      }
    }

    return res.status(200).json({
      status: "success",
      data: {
        run: {
          githubRunId: run.githubRunId,
          workflowName: run.workflowName,
          branch: run.branch,
          commitSha: run.commitSha,
          commitMessage: run.commitMessage,
          actor: run.actor,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          durationSeconds: run.duration || 0,
          status: run.status,
          conclusion: run.conclusion,
        },
        jobs: jobs.map((job) => ({
          githubJobId: job.githubJobId,
          githubRunId: job.githubRunId,
          projectId: job.projectId,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          runnerName: job.runnerName,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          steps: job.steps || [],
        })),
      },
    });
  } catch (err: any) {
    console.error(`[Workflow Run Jobs] Error loading jobs:`, err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
