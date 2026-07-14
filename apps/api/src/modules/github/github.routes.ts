import { Router } from "express";
import { verifyGitHubSignature } from "./github.services.js";
import {
  handleGithubWebhook,
  verifyInstallation,
  getUserRepositoriesFromDb,
  getRepositoryDetailById,
  getWorkflowRunJobs,
} from "./github.controllers.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../lib/asyncHandler.js";

const router = Router();

// GitHub App Webhook receiver endpoint
router.post("/webhook", verifyGitHubSignature, asyncHandler(handleGithubWebhook));

// Verify installation sync status
router.get("/verify-installation", requireAuth, asyncHandler(verifyInstallation));

// Fetch all projects for the user
router.get("/projects", requireAuth, asyncHandler(getUserRepositoriesFromDb));

// Fetch repository details and sync workflows
router.get("/projects/:projectId", requireAuth, asyncHandler(getRepositoryDetailById));

// Fetch jobs and steps for a specific workflow run
router.get("/projects/:projectId/runs/:runId/jobs", requireAuth, asyncHandler(getWorkflowRunJobs));

export { router as githubUpdatedRouter };
