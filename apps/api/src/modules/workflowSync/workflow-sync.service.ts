import { getSocketManager } from "../sockets/socket.service.js";
import { LogPoll } from "./pollers/log.poller.js";
import { WorkflowPoll } from "./pollers/workflow.poller.js";
import { SocketManager } from "../sockets/socketManager.js";
import { prisma } from "../../db.js";
import { Octokit } from "@octokit/rest";

const workflowPollInstance = new WorkflowPoll();
const logPollInstance = new LogPoll();

export class ProjectSync {
    private workflowPoll: WorkflowPoll
    private logpoll: LogPoll
    private socket: SocketManager
    private octokit: Octokit


    constructor(octokit: Octokit) {
        this.workflowPoll = workflowPollInstance
        this.logpoll = logPollInstance
        this.socket = getSocketManager()
        this.octokit = octokit
    }

    async watchAndSyncProject(projectId: string) {
        try {
            const project = await prisma.project.findUnique({
                where: {
                    id: projectId
                }
            })
            if (!project) {
                throw new Error(`Project '${projectId}' not found`)
            }

            if (!project.githubRepoName || !project.githubRepoOwner) {
                throw new Error(`Project '${projectId}' has no linked GitHub repository`)
            }

            this.workflowPoll.ensureWorkflowPoll(projectId,
                this.octokit,
                project.githubRepoName,
                this.logpoll,
                this.socket,
                project.githubRepoOwner
            )

        } catch (error) {
            throw error
        }
    }

}