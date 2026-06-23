import { Router } from "express";
import { startWatching } from "./workflow.controllers.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth } from "../auth/auth.middleware.js";

const router = Router()

router.post("/", requireAuth, asyncHandler(startWatching))

export { router as workflowRouter }