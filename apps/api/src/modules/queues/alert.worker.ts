import { Worker, Job } from 'bullmq';
import { redisConfig } from '../../lib/config/redis.js';
import { ALERT_QUEUE_NAME } from './alert.queue.js';
import { AlertPayload } from '../alert/alert.types.js';
import { AlertStrategyFactory } from '../alert/alert.factory.js';

export function startAlertWorker(): Worker<AlertPayload> {
    const worker = new Worker<AlertPayload>(
        ALERT_QUEUE_NAME,
        async (job: Job<AlertPayload>) => {
            console.log(`[Worker] Processing Job ID #${job.id} for channel: ${job.data.channel}`);

            // 1. Resolve appropriate strategy via Factory
            const strategy = AlertStrategyFactory.getStrategy(job.data.channel);

            // 2. Execute alert delivery
            await strategy.send(job.data);
        },
        {
            connection: redisConfig,
            concurrency: 2, // Control max concurrent alerts processed locally
        }
    );

    // Lifecycle Event Listeners
    worker.on('completed', (job: Job) => {
        console.log(`[Worker Lifecycle] Job #${job.id} successfully completed.`);
    });

    worker.on('failed', (job: Job | undefined, err: Error) => {
        console.error(
            `[Worker Lifecycle] Job #${job?.id} failed on attempt ${job?.attemptsMade}/${job?.opts.attempts}. Error: ${err.message}`
        );
    });

    return worker;
}