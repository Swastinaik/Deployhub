import { Octokit } from "@octokit/rest";
import { SocketManager } from "../../sockets/socketManager.js";
import { logSync } from "../workflow.service.js";

export class LogPoll {
    private activePollers = new Map<number, NodeJS.Timeout>();
    // Associates each runId with the projectId it belongs to so we can
    // clear only the log pollers for a specific project (Bug 3 fix).
    private runToProject = new Map<number, string>();

    createLogPoll(
        runId: number,
        octokit: Octokit,
        repo: string,
        socket: SocketManager,
        owner: string,
        projectId: string
    ) {
        const intervalId = setInterval(async () => {
            try {
                console.log("log syncing for runID", runId);
                await logSync(
                    octokit,
                    socket,
                    (id) => this.clearLogPoll(id),
                    repo,
                    owner,
                    runId,
                    projectId
                )
            } catch (error) {
                console.error(`Error in log poller for run ${runId}:`, error);
            }
        }, 3000)
        this.activePollers.set(runId, intervalId);
        // Track which project this run belongs to
        this.runToProject.set(runId, projectId);
    }

    ensureLogPoll(
        runId: number,
        octokit: Octokit,
        repo: string,
        socket: SocketManager,
        owner: string,
        projectId: string
    ) {
        if (this.activePollers.has(runId)) return
        this.createLogPoll(runId, octokit, repo, socket, owner, projectId)
    }

    clearLogPoll(runId: number) {
        const intervalId = this.activePollers.get(runId)
        if (intervalId) {
            clearInterval(intervalId)
            this.activePollers.delete(runId)
            this.runToProject.delete(runId)
        }
    }

    /**
     * Clears all log pollers that belong to the given projectId.
     * This ensures completing/stopping project A does not affect
     * log pollers for projects B or C (Bug 3 fix).
     */
    clearByProject(projectId: string) {
        for (const [runId, pid] of this.runToProject.entries()) {
            if (pid === projectId) {
                const intervalId = this.activePollers.get(runId)
                if (intervalId) clearInterval(intervalId)
                this.activePollers.delete(runId)
                this.runToProject.delete(runId)
            }
        }
    }

    clearAll() {
        for (const intervalId of this.activePollers.values()) {
            clearInterval(intervalId)
        }
        this.activePollers.clear()
        this.runToProject.clear()
    }
}