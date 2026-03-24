import { Queue, QueueEvents } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse Redis URL into connection options for BullMQ's bundled ioredis
function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.replace('/', ''), 10) || 0 : 0,
      // Don't retry endlessly when Redis is not available in local dev
      maxRetriesPerRequest: null as unknown as number,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 500, 2000);
      },
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null as unknown as number,
      lazyConnect: true,
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 500, 2000)),
    };
  }
}

export const redisOpts = parseRedisUrl(REDIS_URL);

// Lazy-initialised queue — only created when actually used
let _videoQueue: Queue | null = null;
let _videoQueueEvents: QueueEvents | null = null;

export function getVideoQueue(): Queue {
  if (!_videoQueue) {
    _videoQueue = new Queue('video-processing', { connection: redisOpts });
    _videoQueue.on('error', (err) => {
      console.warn('[VideoQueue] Redis error (video teaser generation unavailable):', err.message);
    });
  }
  return _videoQueue;
}

export function getVideoQueueEvents(): QueueEvents {
  if (!_videoQueueEvents) {
    _videoQueueEvents = new QueueEvents('video-processing', { connection: redisOpts });
    _videoQueueEvents.on('error', (err) => {
      console.warn('[VideoQueueEvents] Redis error:', err.message);
    });
  }
  return _videoQueueEvents;
}

// Keep named export for backward compat used in videoProcessor.ts
export const videoQueue = { add: (...args: any[]) => getVideoQueue().add(...args as [any, any]) };
