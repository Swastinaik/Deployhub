import { Response } from "express";
import { AuthedRequest } from "../auth/auth.middleware.js";
import { prisma } from "../../db.js";
import { syncWorkflowRunsAndLogsFirstTime, syncLatestWorkflowRuns } from "./github.service.js";
import { WorkflowRunModel } from "../../models/workflow-run.model.js";
import { BuildLogModel } from "../../models/build-log.model.js";


export async function getUserRepositories(req: AuthedRequest, res: Response) {
    const { data } = await req.octokit!.rest.repos.listForAuthenticatedUser({
        per_page: 10,
        sort: "updated"
    });

    return res.status(200).json({
        status: "success",
        data: data
    });
}


export async function saveRepositoryAsProject(req: AuthedRequest, res: Response) {
    const { owner, repo } = req.body;

    // Input validation
    if (!owner || typeof owner !== "string" || owner.trim() === "") {
        return res.status(400).json({
            status: "error",
            message: "Valid repository owner is required"
        });
    }
    if (!repo || typeof repo !== "string" || repo.trim() === "") {
        return res.status(400).json({
            status: "error",
            message: "Valid repository name is required"
        });
    }

    const trimmedOwner = owner.trim();
    const trimmedRepo = repo.trim();

    // 1. Fetch repository from GitHub to verify access and get metadata
    let repoData;
    try {
        const response = await req.octokit!.rest.repos.get({
            owner: trimmedOwner,
            repo: trimmedRepo,
        });
        repoData = response.data;
    } catch (error: any) {
        console.error(`Failed to fetch repo ${trimmedOwner}/${trimmedRepo} from GitHub:`, error.message);
        return res.status(404).json({
            status: "error",
            message: "Repository not found on GitHub or access denied",
        });
    }

    const githubRepoId = String(repoData.id);
    const defaultBranch = repoData.default_branch || "main";
    const isPrivate = repoData.private;

    // 2. Check if a project already exists for this GitHub repository
    const existingProject = await prisma.project.findUnique({
        where: { githubRepoId },
        include: { members: true },
    });

    if (existingProject) {
        // Check if the user is already a member
        const isMember = existingProject.members.some(
            (member) => member.userId === req.userId
        );

        if (isMember) {
            return res.status(200).json({
                status: "success",
                message: "Project already exists and you are a member",
                data: existingProject,
            });
        }

        // If project exists but user is not a member, add them as a MEMBER
        const newMember = await prisma.projectMember.create({
            data: {
                userId: req.userId!,
                projectId: existingProject.id,
                role: "MEMBER",
            },
            include: {
                project: true,
            },
        });

        return res.status(201).json({
            status: "success",
            message: "You have been added to the existing project",
            data: newMember.project,
        });
    }


    // 3. Create the new Project and set the user as the OWNER
    const newProject = await prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
            data: {
                name: trimmedRepo,
                githubRepoOwner: trimmedOwner,
                githubRepoName: trimmedRepo,
                githubRepoId,
                defaultBranch,
                visibility: isPrivate ? "PRIVATE" : "PUBLIC",
            },
        });

        await tx.projectMember.create({
            data: {
                userId: req.userId!,
                projectId: project.id,
                role: "OWNER",
            },
        });

        return project;
    });

    // 4. Sync actions and logs from GitHub (top 5 workflow runs)
    try {
        await syncWorkflowRunsAndLogsFirstTime(req.octokit!, newProject.id, trimmedOwner, trimmedRepo);
    } catch (syncError: any) {
        console.error(`Workflow sync failed during project creation for ${trimmedOwner}/${trimmedRepo}:`, syncError.message);
    }

    // Refetch the project to get all the newly synced database properties (e.g. lastSynced, latestRunId, lastSyncedAt)
    const syncedProject = await prisma.project.findUnique({
        where: { id: newProject.id },
    });

    return res.status(201).json({
        status: "success",
        message: "Project successfully created from GitHub repository",
        data: syncedProject || newProject,
    });
}


export async function getRepositoryDetails(req: AuthedRequest, res: Response) {
    const { owner, repo } = req.body;

    if (!owner || typeof owner !== "string" || owner.trim() === "") {
        return res.status(400).json({
            status: "error",
            message: "Repository owner parameter is required"
        });
    }
    if (!repo || typeof repo !== "string" || repo.trim() === "") {
        return res.status(400).json({
            status: "error",
            message: "Repository name parameter is required"
        });
    }

    const trimmedOwner = owner.trim();
    const trimmedRepo = repo.trim();

    try {
        const response = await req.octokit!.rest.repos.get({
            owner: trimmedOwner,
            repo: trimmedRepo,
        });

        return res.status(200).json({
            status: "success",
            data: response.data
        });
    } catch (error: any) {
        console.error(`Failed to fetch repo ${trimmedOwner}/${trimmedRepo} from GitHub:`, error.message);
        return res.status(404).json({
            status: "error",
            message: "Repository not found on GitHub or access denied",
        });
    }
}


export async function getRepositoryDetailById(req: AuthedRequest, res: Response) {
    const { projectId } = req.params
    const project = await prisma.project.findUnique({
        where: { id: projectId },
    });
    if (!project) {
        return res.status(404).json({
            status: "error",
            message: "Project not found"
        });
    }

    // Sync the latest workflow runs and logs before returning data to the client
    try {
        await syncLatestWorkflowRuns(
            req.octokit!,
            project.id,
            project.githubRepoOwner!,
            project.githubRepoName!
        );
    } catch (syncError: any) {
        // Log but do not fail the request — return whatever is already stored
        console.error(
            `Incremental sync failed for project ${projectId}:`,
            syncError.message
        );
    }

    const repoResponse = await req.octokit!.rest.repos.get({
        owner: project.githubRepoOwner!,
        repo: project.githubRepoName!,
    });

    // Re-fetch the project so that the updated latestRunId / lastSyncedAt is included in the response
    const updatedProject = await prisma.project.findUnique({
        where: { id: projectId },
    });

    const recentWorkflowRuns = await WorkflowRunModel.find({ projectId })
        .sort({ startedAt: -1 })
        .limit(5)
        .lean();

    return res.status(200).json({
        status: "success",
        data: {
            ...(updatedProject ?? project),
            repoResponse: repoResponse.data,
            recentWorkflowRuns
        }
    });
}


export async function getUserProjects(req: AuthedRequest, res: Response) {
    const projects = await prisma.project.findMany({
        where: {
            members: {
                some: {
                    userId: req.userId
                }
            }
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });

    return res.status(200).json({
        status: "success",
        data: projects
    });
}


export async function getWorkflowRunLogs(req: AuthedRequest, res: Response) {
    const { projectId, runId } = req.params;

    const parsedRunId = Number(runId);
    if (!parsedRunId || isNaN(parsedRunId)) {
        return res.status(400).json({ status: "error", message: "Invalid runId" });
    }

    // Verify the project belongs to this user
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { members: true },
    });
    if (!project) {
        return res.status(404).json({ status: "error", message: "Project not found" });
    }
    const isMember = project.members.some((m) => m.userId === req.userId);
    if (!isMember) {
        return res.status(403).json({ status: "error", message: "Access denied" });
    }

    // Fetch the workflow run metadata
    const workflowRun = await WorkflowRunModel.findOne({ githubRunId: parsedRunId }).lean();
    if (!workflowRun) {
        return res.status(404).json({ status: "error", message: "Workflow run not found" });
    }

    // Fetch all log lines for this run, sorted chronologically
    const logs = await BuildLogModel.find({ workflowRunId: parsedRunId })
        .sort({ timestamp: 1 })
        .lean();

    return res.status(200).json({
        status: "success",
        data: {
            run: workflowRun,
            logs,
        },
    });
} 