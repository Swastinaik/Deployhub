import { Router } from "express";
import { getUserRepositories, saveRepositoryAsProject, getRepositoryDetails, getRepositoryDetailById, getUserProjects, getWorkflowRunLogs } from "./github.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../lib/asyncHandler.js";

const router = Router();

router.get("/repos", requireAuth, asyncHandler(getUserRepositories));
router.get("/repos/:owner/:repo", requireAuth, asyncHandler(getRepositoryDetails));
router.post("/projects", requireAuth, asyncHandler(saveRepositoryAsProject));
router.get("/projects", requireAuth, asyncHandler(getUserProjects));
router.get("/projects/:projectId", requireAuth, asyncHandler(getRepositoryDetailById));
router.get("/projects/:projectId/runs/:runId/logs", requireAuth, asyncHandler(getWorkflowRunLogs));

export { router as githubRouter };



