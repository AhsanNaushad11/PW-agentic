import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import * as path from 'path';
import * as fs from 'fs';
import { SqaJobPayload } from './src/types/job.types';
import { BrowserManager } from './src/automation/BrowserManager';
import { VisionMatcher } from './src/automation/VisionMatcher';
import { GeminiVisionProvider } from './src/ai/GeminiVisionProvider';

// =============================================================================
// TIER 3: SQA EXECUTION WORKER
// =============================================================================

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
// concurrency: 1 ensures only one Playwright browser runs at a time,
// preventing resource contention on a single machine.
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

    // --- Browser Lifecycle ---
    const browserManager = new BrowserManager();
    let roundsCompleted = 0;
    
    // Lift screenshotDir into outer scope so it can be cleaned up in finally block
    const screenshotDir = path.resolve(__dirname, 'screenshots', `job-${job.id}`);

    try {
      // 1. Initialize browser with optional user-agent override
      await browserManager.initialize(job.data.sessionContext?.userAgentOverride);

      // SCALE ALIGNMENT: Force a static 1280x720 viewport to completely
      // eliminate computer vision scale drift between template images and
      // runtime screenshots. Templates MUST be cropped from this resolution.
      if (!browserManager.page) {
        throw new Error('[FATAL] BrowserManager initialized but page is null.');
      }
      await browserManager.page.setViewportSize({ width: 1280, height: 720 });

      // 2. Navigate to the game URL
      await browserManager.loadGame(job.data);

      // Resolve the template path for this game mode.
      // Expected file: assets/templates/<gameMode>_spin_btn.png
      const templatePath = path.resolve(__dirname, 'assets', 'templates', `${gameMode}_spin_btn.png`);

      // Ensure the screenshot directory exists for this specific job before starting the loop
      await fs.promises.mkdir(screenshotDir, { recursive: true });

      // --- Core Execution Loop ---
      // Process rounds sequentially. Action Screenshot → Vision Match → Click → Delay → Result Screenshot → Gemini → Memory Check.
      for (let round = 1; round <= executionParameters.targetRounds; round++) {
        console.log(`\n[ROUND ${round}/${executionParameters.targetRounds}] Starting...`);

        // 3a. Capture the pre-spin action screenshot.
        // Used by OpenCV to locate the coordinate position of the UI controls.
        const actionScreenshotPath = path.resolve(screenshotDir, `action-round-${round}.png`);
        await browserManager.page.screenshot({ path: actionScreenshotPath });
        console.log(`  [SCREENSHOT: ACTION] Saved to ${actionScreenshotPath}`);

        // 3b. Run the OpenCV vision pipeline to locate the spin button.
        const matchResult = await VisionMatcher.findElementCoordinates(
          actionScreenshotPath,
          templatePath,
          0.85 // SRS-mandated confidence threshold
        );

        // 3c. Execute a physical coordinate injection if a match is found.
        // Playwright's page.mouse.click sends a real mousedown/mouseup event
        // at the exact pixel coordinates, bypassing Canvas DOM limitations.
        if (matchResult.found && matchResult.x !== undefined && matchResult.y !== undefined) {
          console.log(`  [CLICK] Injecting click at (${matchResult.x}, ${matchResult.y})`);
          await browserManager.page.mouse.click(matchResult.x, matchResult.y);
        } else {
          console.warn(`  [WARN] Spin button not found in round ${round}. Confidence: ${matchResult.confidence.toFixed(4)}. Proceeding.`);
        }

        // 3d. Wait exactly 3000ms to guarantee we capture the peak of the WebGL win animation.
        await browserManager.page.waitForTimeout(3000);

        // 3e. Capture the post-spin result screenshot.
        // Used by the Gemini LLM to extract financial metrics from the settled canvas.
        const resultScreenshotPath = path.resolve(screenshotDir, `result-round-${round}.png`);
        await browserManager.page.screenshot({ path: resultScreenshotPath });
        console.log(`  [SCREENSHOT: RESULT] Saved to ${resultScreenshotPath}`);

        // 3f. Send the result screenshot to Gemini for OCR extraction.
        console.log(`  [GEMINI] Analyzing result frame...`);
        try {
          // FLAW FIX: We wrap the AI call in an inner try-catch. If Gemini hits an
          // unexpected safety block, HTTP 429, or network drop on Round 45 out of 100, 
          // we MUST NOT crash the entire job. We log the failure and proceed.
          const extraction = await GeminiVisionProvider.analyzeFrame(resultScreenshotPath);
          console.log(`  [GEMINI RESULTS] Balance: ${extraction.currentBalance} | Bet: ${extraction.betAmount} | Win: ${extraction.winAmount}`);
        } catch (aiError) {
          console.error(`  [GEMINI ERROR] Vision extraction failed for round ${round}. Skipping OCR this round. Reason: ${aiError}`);
        }

        // 3g. Wait the remaining interval before proceeding to memory check and the next round.
        const remainingInterval = Math.max(0, executionParameters.spinIntervalMs - 3000);
        if (remainingInterval > 0) {
          await browserManager.page.waitForTimeout(remainingInterval);
        }

        // 3h. Trigger the runtime memory evaluator.
        // If RSS exceeds the threshold, this will call close() internally
        // and throw — the catch block below will handle it.
        await browserManager.checkMemoryThreshold(executionParameters.maxMemoryThresholdMb);

        roundsCompleted = round;
      }

      console.log(`\n[EXECUTION COMPLETE] All ${executionParameters.targetRounds} rounds finished.`);
      return { status: 'success', roundsCompleted };

    } catch (err) {
      // Log the failure context with the round number for debugging.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[EXECUTION ERROR] Failed at round ${roundsCompleted + 1}: ${message}`);
      throw err; // Re-throw so BullMQ marks the job as failed.

    } finally {
      // CLEANUP: Guarantee browser teardown regardless of success or failure.
      // This is the memory isolation layer — no Chromium process survives
      // past this point, even on unhandled errors mid-loop.
      console.log('[TEARDOWN] Closing browser...');
      await browserManager.close();

      // FLAW FIX: Prevent severe disk exhaustion. Purge the job's screenshot 
      // directory unconditionally once the job finishes (success or failure).
      console.log(`[TEARDOWN] Purging screenshots directory for Job ${job.id}...`);
      await fs.promises.rm(screenshotDir, { recursive: true, force: true }).catch(err => {
        console.error(`[TEARDOWN ERROR] Failed to purge screenshot directory: ${err.message}`);
      });
    }
  },
  { connection: connection as any, concurrency: 1 }
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

// =============================================================================
// SPECULATED ISSUES & KNOWN LIMITATIONS — FOR THE RECORD
// =============================================================================
//
// 1. [FIXED] DISK SPACE EXHAUSTION (SCREENSHOT LEAK)
//    The worker writes a 1280x720 PNG frame to disk for every single round.
//    A 1,000-round job produces 1-2GB of image data. This has been resolved by
//    implementing an unconditional `fs.promises.rm` purge block in the `finally` 
//    clause, guaranteeing immediate storage reclamation after the job completes.
//
// 2. INFINITE NAVIGATION HANG
//    BrowserManager's `loadGame` enforces `waitUntil: 'networkidle'`. If a
//    target WebGL game maintains a persistent WebSocket connection, or streams
//    background audio, the network may *never* go idle. This will cause the
//    initial navigation to time out after 60s, failing the job before it starts.
//
// 3. GAME STATE DESYNC (BLIND FIRE-AND-FORGET)
//    The core loop injects a physical click, waits a hardcoded interval, and
//    assumes the round completed successfully. It does not verify if the
//    spin button actually transitioned to a "spinning" state or if a popup
//    (e.g., "Insufficient Funds") blocked the click. If the game server lags,
//    the loop will violently desync from the game state.
//
// 4. BULLMQ STALLS VIA EVENT LOOP STARVATION
//    Heavy OpenCV image processing running synchronously or holding the thread
//    can starve Node's event loop. If the loop stalls longer than BullMQ's
//    lock duration (default 30s), BullMQ assumes the worker crashed and
//    re-queues the job to another worker, leading to duplicate simultaneous
//    executions across multiple nodes.
//
// =============================================================================
