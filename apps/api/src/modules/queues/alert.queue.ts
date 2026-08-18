import { Queue } from 'bullmq';
import { redisConfig } from '../../lib/config/redis.js';
import { AlertPayload } from '../alert/alert.types.js';

export const ALERT_QUEUE_NAME = 'alert-notifications';

export const alertQueue = new Queue<AlertPayload>(ALERT_QUEUE_NAME, {
    connection: redisConfig,
    defaultJobOptions: {
        attempts: 3, // Retry failed alerts up to 3 times
        backoff: {
            type: 'exponential', // Wait 2s, 4s, 8s between retries
            delay: 2000,
        },
        removeOnComplete: true, // Keep Redis memory clean
        removeOnFail: false,    // Retain failed jobs for inspection
    },
});

export async function enqueueAlert(payload: AlertPayload): Promise<string> {
    const deterministicId = payload.metadata?.runId
        ? `alert-${payload.channel}-${payload.metadata.runId}-${payload.recipient}`
        : undefined;

    const job = await alertQueue.add(`alert-${payload.channel}`, payload, {
        ...(deterministicId ? { jobId: deterministicId } : {}),
    });
    console.log(`[Queue Producer] Alert job enqueued with ID: ${job.id}`);
    return job.id!;
}