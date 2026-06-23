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

    getRoomSize(roomName: string) {
        const room = this.io.sockets.adapter.rooms.get(roomName);
        return room ? room.size : 0;
    }
}