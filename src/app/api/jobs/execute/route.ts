import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// =============================================================================
// TIER 2: SQA JOB ENQUEUE API ROUTE
// =============================================================================
// This Next.js API route acts as the bridge between Tier 1 (Frontend) and
// Tier 3 (Worker). It receives a POST request containing an SQA job payload,
// validates the data contract, and enqueues the job into a BullMQ queue
// backed by a local Redis instance.
//
// ARCHITECTURE NOTE: This route uses a `globalThis` singleton pattern to
// prevent Redis connection leaks during Next.js Hot Module Replacement (HMR).
// In development, Next.js re-evaluates API route modules on every save,
// which would create a new Redis connection each time without this pattern.
// =============================================================================

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

/**
 * The canonical game mode union type.
 * MUST remain in sync with `GameMode` in `worker/src/types/job.types.ts`.
 */
type GameMode = 'slot' | 'crash' | 'plinko';

/**
 * Represents the SQA Job Payload dispatched by the Tier 1 Frontend.
 *
 * This is the canonical data contract between all three tiers.
 * The Tier 3 Worker destructures `job.data` expecting this exact shape.
 *
 * @property targetUrl           - The full URL of the canvas game to automate.
 * @property gameMode            - The game vertical (slot, crash, plinko).
 * @property executionParameters - Numeric guardrails governing the test run.
 */
interface SqaJobPayload {
  targetUrl: string;
  gameMode: GameMode;
  executionParameters: {
    /** Number of automation rounds (spins/bets) to execute. */
    targetRounds: number;
    /** Milliseconds between each round. SRS mandates >= 5000. */
    spinIntervalMs: number;
    /** RSS memory ceiling in MB. Worker hard-halts if exceeded. */
    maxMemoryThresholdMb: number;
  };
}

/**
 * Shape of the JSON response returned by this API route.
 * Used by both success (200) and error (400/500) responses.
 */
interface ApiResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}

// -----------------------------------------------------------------------------
// Redis & BullMQ Singleton (globalThis Pattern)
// -----------------------------------------------------------------------------
// CRITICAL: DO NOT refactor this section. The globalThis singleton pattern is
// intentionally designed to survive Next.js HMR module re-evaluations.
// Without it, every code save in development creates a new ioredis connection,
// eventually exhausting the Redis server's max client limit.
// -----------------------------------------------------------------------------

/** Redis connection configuration. */
const REDIS_CONFIG = {
  host: 'localhost',
  port: 6379,
  /** BullMQ requires null to disable ioredis's per-command retry limit. */
  maxRetriesPerRequest: null,
} as const;

/** The queue name MUST match the queue name in the Tier 3 Worker. */
const QUEUE_NAME = 'sqa-jobs';

/**
 * Extends globalThis with optional singleton references.
 * These persist across HMR cycles in development.
 */
const globalWithRedis = globalThis as unknown as {
  _redisConnection?: IORedis;
  _sqaQueue?: Queue;
};

/**
 * Returns the singleton Redis connection.
 * Creates a new connection only on first invocation (or after a server restart).
 */
function getRedisConnection(): IORedis {
  if (!globalWithRedis._redisConnection) {
    globalWithRedis._redisConnection = new IORedis(REDIS_CONFIG);
  }
  return globalWithRedis._redisConnection;
}

/**
 * Returns the singleton BullMQ Queue instance.
 * Lazily initializes the queue using the singleton Redis connection.
 */
function getQueue(): Queue {
  if (!globalWithRedis._sqaQueue) {
    const connection = getRedisConnection();
    globalWithRedis._sqaQueue = new Queue(QUEUE_NAME, { connection: connection as any });
  }
  return globalWithRedis._sqaQueue;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * Validates the incoming payload against the `SqaJobPayload` contract.
 * Returns a human-readable error string if validation fails, or null if valid.
 *
 * This is a runtime guard because TypeScript interfaces are erased at compile
 * time — we cannot trust that the HTTP client sent well-formed data.
 *
 * @param payload - The raw parsed JSON body from the request.
 * @returns An error message string if invalid, or null if the payload is valid.
 */
function validatePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return 'Request body must be a JSON object.';
  }

  const data = payload as Record<string, unknown>;

  // --- Top-level field validation ---
  if (typeof data.targetUrl !== 'string' || data.targetUrl.trim() === '') {
    return 'Missing or empty required field: targetUrl.';
  }

  const validGameModes: GameMode[] = ['slot', 'crash', 'plinko'];
  if (!validGameModes.includes(data.gameMode as GameMode)) {
    return `Invalid gameMode: "${data.gameMode}". Must be one of: ${validGameModes.join(', ')}.`;
  }

  // --- Nested executionParameters validation ---
  if (!data.executionParameters || typeof data.executionParameters !== 'object') {
    return 'Missing required field: executionParameters.';
  }

  const params = data.executionParameters as Record<string, unknown>;

  const targetRounds = params['targetRounds'];
  if (typeof targetRounds !== 'number' || !Number.isFinite(targetRounds)) {
    return 'executionParameters.targetRounds must be a finite number.';
  }
  if (targetRounds < 1) {
    return `executionParameters.targetRounds must be >= 1. Received: ${targetRounds}.`;
  }

  const spinIntervalMs = params['spinIntervalMs'];
  if (typeof spinIntervalMs !== 'number' || !Number.isFinite(spinIntervalMs)) {
    return 'executionParameters.spinIntervalMs must be a finite number.';
  }
  if (spinIntervalMs < 3000) {
    return `executionParameters.spinIntervalMs must be >= 3000. Received: ${spinIntervalMs}.`;
  }

  const maxMemoryThresholdMb = params['maxMemoryThresholdMb'];
  if (typeof maxMemoryThresholdMb !== 'number' || !Number.isFinite(maxMemoryThresholdMb)) {
    return 'executionParameters.maxMemoryThresholdMb must be a finite number.';
  }
  if (maxMemoryThresholdMb < 256) {
    return `executionParameters.maxMemoryThresholdMb must be >= 256. Received: ${maxMemoryThresholdMb}.`;
  }

  return null; // Payload is valid.
}

// -----------------------------------------------------------------------------
// Route Handler
// -----------------------------------------------------------------------------

/**
 * POST /api/jobs/execute
 *
 * Accepts an SQA job payload from the Tier 1 Frontend, validates its structure,
 * and enqueues it into the BullMQ `sqa-jobs` queue for consumption by the
 * Tier 3 Worker.
 *
 * @param req - The incoming HTTP request containing a JSON body.
 * @returns A JSON response with the job ID on success, or an error message.
 *
 * Response Codes:
 * - 200: Job enqueued successfully. Body: `{ success: true, jobId: string }`.
 * - 400: Malformed payload. Body: `{ success: false, error: string }`.
 * - 500: Internal error (Redis down, queue failure). Body: `{ success: false, error: string }`.
 */
export async function POST(req: Request) {
  try {
    // GUARD: Parse the request body. If the body is not valid JSON,
    // req.json() will throw and we catch it in the outer try/catch.
    const payload = await req.json();

    // GUARD: Validate the payload against the strict data contract.
    const validationError = validatePayload(payload);
    if (validationError) {
      const response: ApiResponse = { success: false, error: validationError };
      return NextResponse.json(response, { status: 400 });
    }

    // At this point, payload is validated. Safe to cast.
    const validatedPayload = payload as SqaJobPayload;

    // Retrieve the singleton queue and enqueue the job.
    const queue = getQueue();
    const job = await queue.add('execute-test', validatedPayload);

    const response: ApiResponse = { success: true, jobId: job.id };
    return NextResponse.json(response, { status: 200 });

  } catch (error: unknown) {
    // GUARD: Catch all unhandled errors — malformed JSON, Redis connection
    // failures, BullMQ internal errors, etc.
    console.error('[Tier 2] Enqueue Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    const response: ApiResponse = { success: false, error: errorMessage };
    return NextResponse.json(response, { status: 500 });
  }
}
