import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Interface representing the SQA Job Payload.
 */
interface SqaJobPayload {
  targetUrl: string;
  gameMode: string;
  executionParameters: Record<string, unknown>;
}

/**
 * Singleton configuration for Redis and BullMQ to prevent connection leaks
 * during Next.js Hot Module Replacement (HMR).
 */
const REDIS_CONFIG = {
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,
};

const globalWithRedis = globalThis as unknown as {
  _redisConnection?: IORedis;
  _sqaQueue?: Queue;
};

function getRedisConnection(): IORedis {
  if (!globalWithRedis._redisConnection) {
    globalWithRedis._redisConnection = new IORedis(REDIS_CONFIG);
  }
  return globalWithRedis._redisConnection;
}

function getQueue(): Queue {
  if (!globalWithRedis._sqaQueue) {
    const connection = getRedisConnection();
    globalWithRedis._sqaQueue = new Queue('sqa-jobs', { connection });
  }
  return globalWithRedis._sqaQueue;
}

/**
 * POST handler for enqueuing automation jobs.
 */
export async function POST(req: Request) {
  try {
    const payload: SqaJobPayload = await req.json();

    // Strict validation of payload structure
    if (!payload.targetUrl || !payload.gameMode || !payload.executionParameters) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: targetUrl, gameMode, or executionParameters' },
        { status: 400 }
      );
    }

    const queue = getQueue();

    // Enqueue the job into BullMQ
    const job = await queue.add('execute-test', payload);

    return NextResponse.json({
      success: true,
      jobId: job.id,
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('[Tier 2] Enqueue Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error enqueuing job';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
