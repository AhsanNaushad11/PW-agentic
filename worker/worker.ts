import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { SqaJobPayload } from './src/types/job.types';

const QUEUE_NAME = 'sqa-jobs';

// --- Redis Connection ---
// maxRetriesPerRequest: null is required by BullMQ to disable ioredis's
// default per-command retry limit, allowing BullMQ to manage retries itself.
const connection = new IORedis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,
});

// GUARD: If Redis is unreachable at startup (or drops later), ioredis emits
// an 'error' event. Without this listener the process crashes silently with
// an unhandled error.
connection.on('error', (err) => {
  console.error(`[REDIS] Connection error: ${err.message}`);
});

connection.on('connect', () => {
  console.log(`[REDIS] Connected to localhost:6379`);
});

// --- Worker Definition ---
// We strictly type the Worker to only accept SqaJobPayload.
const worker = new Worker<SqaJobPayload>(
  QUEUE_NAME,
  async (job: Job<SqaJobPayload>) => {
    // GUARD: Validate that job.data contains the expected shape before
    // destructuring. A malformed payload (e.g. enqueued by a different
    // producer version) would otherwise throw an untyped TypeError.
    if (!job.data || !job.data.targetUrl || !job.data.executionParameters) {
      throw new Error(
        `[VALIDATION] Job ${job.id} has a malformed payload. ` +
        `Missing required fields: targetUrl or executionParameters.`
      );
    }

    const { targetUrl, gameMode, executionParameters } = job.data;
    
    console.log(`--------------------------------------------------`);
    console.log(`[EXECUTION START] Job ID: ${job.id}`);
    console.log(`[TARGET] ${targetUrl} | Mode: ${gameMode}`);
    console.log(`[PARAMS] Rounds: ${executionParameters.targetRounds} | Interval: ${executionParameters.spinIntervalMs}ms`);
    
    // TODO: The Playwright Automation Hook will go here
    // await runPlaywrightTestLoop(job.data);

    return { status: 'success', roundsCompleted: executionParameters.targetRounds };
  },
  { connection: connection as any }
);

// --- Worker Event Handlers ---

// NOTE: BullMQ can pass undefined for `job` in edge cases (e.g. if the job
// was removed before the event fires). Use optional chaining defensively.
worker.on('completed', (job) => {
  console.log(`[Job ${job?.id}] Successfully completed payload execution.`);
});

worker.on('failed', (job, err) => {
  console.error(`[Job ${job?.id}] FAILED. Reason: ${err.message}`);
});

// GUARD: The 'error' event is emitted for infrastructure-level failures
// (e.g. lost Redis connection mid-job). Without this listener, Node treats
// it as an unhandled error and terminates the process.
worker.on('error', (err) => {
  console.error(`[FATAL] Worker encountered an error: ${err.message}`);
});

// --- Graceful Shutdown ---
// When the process receives SIGTERM (Docker stop, systemd, etc.) or SIGINT
// (Ctrl+C), we must close the worker gracefully. worker.close() waits for
// the currently running job to finish, then disconnects from Redis. Without
// this, in-flight jobs get stuck in the "active" state and are never retried.
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[SHUTDOWN] Received ${signal}. Closing worker gracefully...`);
  try {
    await worker.close();
    await connection.quit();
    console.log('[SHUTDOWN] Worker and Redis connection closed cleanly.');
  } catch (err) {
    console.error('[SHUTDOWN] Error during graceful shutdown:', err);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Global Safety Net ---
// Last-resort handlers to log crashes that escape all other error handling.
// These prevent silent process deaths in production.
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  // Exit after logging — the process is in an unknown state and continuing
  // could cause data corruption or zombie Playwright browsers.
  process.exit(1);
});

console.log(`[WORKER] Listening on queue "${QUEUE_NAME}"...`);
