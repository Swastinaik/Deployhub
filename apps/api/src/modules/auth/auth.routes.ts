import { Router } from "express";
import { githubCallback, redirectToGithub, refreshToken } from "./auth.controller.js";
import { asyncHandler } from "../../lib/asyncHandler.js";

const router = Router();

router.get("/github", asyncHandler(redirectToGithub));

router.get(
    "/github/callback",
    asyncHandler(githubCallback)
);

router.post("/refresh", asyncHandler(refreshToken));

export { router as authrouter };
