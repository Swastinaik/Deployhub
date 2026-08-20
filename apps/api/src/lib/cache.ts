import { Redis } from "ioredis";

// Global cache client instance
let redisCacheClient: Redis | null = null;
let isConnected = false;
let errorLoggedOnce = false;

export function getRedisClient(): Redis | null {
  if (redisCacheClient) {
    return redisCacheClient;
  }

  try {
    const redisUrl = process.env.REDIS_CACHE_URL || process.env.REDIS_URL;

    if (redisUrl) {
      // Connect using Render Redis URL
      redisCacheClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
        retryStrategy(times: number) {
          return Math.min(times * 200, 5000);
        },
      });
    } else if (process.env.UPSTASH_REDIS_HOST && process.env.UPSTASH_REDIS_PASSWORD) {
      // Fallback to Upstash if REDIS_CACHE_URL is not set
      redisCacheClient = new Redis({
        host: process.env.UPSTASH_REDIS_HOST,
        port: Number(process.env.UPSTASH_REDIS_PORT) || 6379,
        password: process.env.UPSTASH_REDIS_PASSWORD,
        family: 4,
        tls: {
          rejectUnauthorized: false,
        },
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableReadyCheck: false,
        retryStrategy(times: number) {
          return Math.min(times * 200, 5000);
        },
      });
    } else {
      return null;
    }

    redisCacheClient.on("connect", () => {
      isConnected = true;
      errorLoggedOnce = false;
      console.log("[Redis Cache] Successfully connected to Redis Cache instance.");
    });

    redisCacheClient.on("ready", () => {
      isConnected = true;
    });

    redisCacheClient.on("error", (err: any) => {
      isConnected = false;
      if (!errorLoggedOnce) {
        console.warn(`[Redis Cache] Connection error: ${err.message}. Failing open (bypassing cache).`);
        errorLoggedOnce = true;
      }
    });

    redisCacheClient.on("close", () => {
      isConnected = false;
    });

    // Initiate connection
    redisCacheClient.connect().catch((err: any) => {
      if (!errorLoggedOnce) {
        console.warn(`[Redis Cache] Initial connection failed: ${err.message}. Operating in fail-open mode.`);
        errorLoggedOnce = true;
      }
    });

    return redisCacheClient;
  } catch (err: any) {
    console.warn(`[Redis Cache] Initialization failed: ${err.message}. Cache disabled.`);
    return null;
  }
}

// Helper to set client directly (useful for tests or custom injection)
export function setRedisClientForTesting(client: Redis | null, connected: boolean = true) {
  redisCacheClient = client;
  isConnected = connected;
}

/**
 * Retrieve parsed JSON value from cache.
 * Returns null on cache miss or any Redis failure (fail-open).
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client || !isConnected) return null;
  try {
    const data = await client.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err: any) {
    console.warn(`[Redis Cache] Error getting key "${key}": ${err.message}`);
    return null;
  }
}

/**
 * Store a JSON-serializable value in cache with an optional TTL in seconds.
 */
export async function setCache(key: string, value: any, ttlSeconds?: number): Promise<void> {
  const client = getRedisClient();
  if (!client || !isConnected) return;

  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, serialized, "EX", ttlSeconds);
    } else {
      await client.set(key, serialized);
    }
  } catch (err: any) {
    console.warn(`[Redis Cache] Error setting key "${key}": ${err.message}`);
  }
}

/**
 * Delete one or more specific keys from cache.
 */
export async function deleteCache(keys: string | string[]): Promise<void> {
  const client = getRedisClient();
  if (!client || !isConnected) return;

  try {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    if (keyArray.length === 0) return;
    await client.del(...keyArray);
  } catch (err: any) {
    console.warn(`[Redis Cache] Error deleting keys: ${err.message}`);
  }
}

/**
 * Safely delete keys matching a pattern using SCAN (non-blocking).
 * Example pattern: 'project:123:*'
 */
export async function deletePattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  if (!client || !isConnected) return;

  try {
    const stream = client.scanStream({
      match: pattern,
      count: 100,
    });

    const pipeline = client.pipeline();
    let keysFound = 0;

    for await (const keys of stream) {
      if (keys.length) {
        keysFound += keys.length;
        keys.forEach((k: string) => pipeline.del(k));
      }
    }

    if (keysFound > 0) {
      await pipeline.exec();
    }
  } catch (err: any) {
    console.warn(`[Redis Cache] Error deleting pattern "${pattern}": ${err.message}`);
  }
}
