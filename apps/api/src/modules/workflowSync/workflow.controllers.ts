import { AuthedRequest } from "../auth/auth.middleware.js";
import { Response } from "express";
import { ProjectSync } from "./workflow-sync.service.js";


export async function startWatching(req: AuthedRequest, res: Response) {
    const { projectId } = req.body

    // Bug 7 fix: validate projectId early so callers get a proper 400 instead
    // of a silent 200 when the field is missing or malformed.
    if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ success: false, message: "projectId is required and must be a string" })
    }

    const projectsync = new ProjectSync(req.octokit!);
    await projectsync.watchAndSyncProject(projectId)
    return res.status(200).json({ success: true, message: "Successfully observing repo and logs" })
}