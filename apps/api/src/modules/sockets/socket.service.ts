import { Server } from 'socket.io';
import { SocketManager } from './socketManager.js'; // Path to your class file

let socketManagerInstance: SocketManager | null = null;

/**
 * Call this ONCE in your entry server file (app.ts/server.ts) to bootstrap socket.io
 */
export function initSocketManager(io: Server): SocketManager {
    if (socketManagerInstance) {
        console.warn('SocketManager is already initialized. Returning existing instance.');
        return socketManagerInstance;
    }
    socketManagerInstance = new SocketManager(io);
    socketManagerInstance.initConnection();
    return socketManagerInstance;
}

/**
 * Import and call this inside ANY controller or service to get the active instance
 */
export function getSocketManager(): SocketManager {
    if (!socketManagerInstance) {
        throw new Error(
            'SocketManager has not been initialized! Make sure initSocketManager(io) is called at server startup.'
        );
    }
    return socketManagerInstance;
}
