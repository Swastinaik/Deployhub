import { Server, Socket } from "socket.io";
import { LogType, WorkflowRunType } from "../../lib/types.js";


export class SocketManager {
    private io: Server;
    constructor(io: Server) {
        this.io = io;
    }

    initConnection() {
        this.io.on("connection", (socket: Socket) => {
            console.log("user connected", socket.id);

            socket.on("join_project", (projectId: string) => {
                socket.join(projectId);
                console.log(`socket ${socket.id} joined project room: ${projectId}`);
            });

            socket.on("leave_project", (projectId: string) => {
                socket.leave(projectId);
                console.log(`socket ${socket.id} left project room: ${projectId}`);
            });

            socket.on("join_repo", (repoId: string | number) => {
                const roomName = `repo_room_${repoId}`;
                socket.join(roomName);
                console.log(`socket ${socket.id} joined repo room: ${roomName}`);
            });

            socket.on("leave_repo", (repoId: string | number) => {
                const roomName = `repo_room_${repoId}`;
                socket.leave(roomName);
                console.log(`socket ${socket.id} left repo room: ${roomName}`);
            });

            socket.on("disconnect", () => {
                console.log("user disconnected", socket.id);
            });
        })
    }

    async broadcastWorkflowSync(projectId: string, workflow: WorkflowRunType) {
        this.io.to(projectId).emit("workflow_synced", workflow);
    }

    async broadcastWorkflowLogs(projectId: string, log: LogType[]) {
        this.io.to(projectId).emit("workflow_logs", log);
    }

    broadcastWorkflowEvent(repoId: string | number, data: any) {
        const roomName = `repo_room_${repoId}`;
        this.io.to(roomName).emit("build_framework_update", data);
        console.log(`[SocketManager] Broadcasted build_framework_update to ${roomName}`);
    }

    broadcastJobEvent(repoId: string | number, data: any) {
        const roomName = `repo_room_${repoId}`;
        this.io.to(roomName).emit("build_job_update", data);
        console.log(`[SocketManager] Broadcasted build_job_update to ${roomName}`);
    }

    getRoomSize(roomName: string) {
        const room = this.io.sockets.adapter.rooms.get(roomName);
        return room ? room.size : 0;
    }
}