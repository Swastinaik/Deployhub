import { Octokit } from "@octokit/rest";
import { SocketManager } from "../../sockets/socketManager.js";
import { workflowSync } from "../workflow.service.js";
import { LogPoll } from "./log.poller.js";

export class WorkflowPoll {
    // map projectId with IntervalId
    private activePollers = new Map<string, NodeJS.Timeout>();

    createWorkflowPoll(
        projectId: string,
        octokit: Octokit,
        repo: string,
        logpoll: LogPoll,
        socket: SocketManager,
        owner: string
    ) {
        const intervalId = setInterval(async () => {
            // Bug 4 fix: wrap async body so rejections don't become unhandled
            // promise rejections that can crash Node 15+ processes.
            console.log(" workflow started for project ", projectId)
            try {
                await workflowSync(
                    octokit,
                    repo,
                    projectId,
                    owner,
                    () => {
                        // Bug 2 fix: clear only THIS project's workflow poller, not all.
                        // Bug 3 fix: clear only THIS project's log pollers via clearByProject.
                        this.clearWorkflowPoll(projectId);
                        logpoll.clearByProject(projectId);
                    },
                    logpoll,
                    socket
                );
            } catch (error) {
                console.error(`[WorkflowPoll] Error polling projectId ${projectId}:`, error);
            }
        }, 5000);

        this.activePollers.set(projectId, intervalId);
    }

    ensureWorkflowPoll(
        projectId: string,
        octokit: Octokit,
        repo: string,
        logpoll: LogPoll,
        socket: SocketManager,
        owner: string
    ) {
        if (this.activePollers.has(projectId)) return
        this.createWorkflowPoll(projectId, octokit, repo, logpoll, socket, owner)
    }

    clearWorkflowPoll(projectId: string) {
        const intervalId = this.activePollers.get(projectId)
        if (intervalId) {
            clearInterval(intervalId)
            this.activePollers.delete(projectId)
        }
    }

    clearAllWorkflowPoll() {
        for (const intervalId of this.activePollers.values()) {
            clearInterval(intervalId)
        }
        this.activePollers.clear()
    }
}