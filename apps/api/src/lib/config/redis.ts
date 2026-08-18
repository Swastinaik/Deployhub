import { ConnectionOptions } from 'bullmq';

export const redisConfig: ConnectionOptions = {
    host: process.env.UPSTASH_REDIS_HOST, // e.g., 'smooth-cat-12345.upstash.io'
    port: Number(process.env.UPSTASH_REDIS_PORT) || 6379,
    username: 'default',
    password: process.env.UPSTASH_REDIS_PASSWORD,
    family: 4,
    tls: {
        rejectUnauthorized: false,
    },
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,   // Required for Upstash serverless compatibility
};
