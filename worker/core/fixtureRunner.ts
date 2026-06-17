import { PlaywrightEngine } from './playwrightEngine';
import { parseTerminalState } from '../vision/ocr';
import { broadcastLog } from '../index';
import * as fs from 'fs';
import * as path from 'path';

/**
 * JobData — The contract between the BullMQ payload translator (index.ts)
 * and this execution module. Every field is required for the runner to
 * operate correctly. The `timing` sub-object controls the cadence of the
 * automated spin loop.
 */
interface JobData {
  jobId: string;
  targetUrl: string;
  mode: string;
  config: {
    totalRounds: number;
    lowBalanceHaltThreshold: number;
    timing: {
      roundIntervalMs: number;
      visibilityWindowMs: number;
    }
  };
}

/**
 * executeJob — The primary entry point for Tier 3 job execution.
 *
 * This function receives a validated job payload from the BullMQ worker
 * (index.ts), launches a headful Chromium browser via Playwright, navigates
 * to the target game URL, and enters a loop that:
 *   1. Triggers a spin action (spacebar fallback).
 *   2. Waits for the spin to resolve.
 *   3. Captures a screenshot and saves it to disk as evidence.
 *   4. Sends the screenshot to Gemini 2.5 Pro for OCR extraction.
 *   5. Evaluates soft assertions (win/loss consistency).
 *   6. Checks hard halt conditions (low balance threshold).
 *
 * @param data - The translated job payload conforming to the JobData interface.
 */
export async function executeJob(data: JobData) {
  // ── Pre-flight Validation ──────────────────────────────────────────────
  // Guard against malformed payloads that would cause a runtime TypeError
  // deep inside the loop (e.g., accessing `data.config.timing.roundIntervalMs`
  // on an undefined object). Failing fast here gives a clear error message
  // instead of a cryptic "Cannot read properties of undefined".
  if (!data?.config?.timing) {
    throw new Error(`[VALIDATION] Job ${data?.jobId} has malformed config — missing config.timing.`);
  }

  const engine = new PlaywrightEngine();

  // ── Evidence Directory Setup ───────────────────────────────────────────
  // Each job gets its own timestamped folder inside worker/evidence/
  // so that screenshots from different jobs never collide.
  // The timestamp uses ISO format with colons and dots replaced by dashes
  // because Windows does not allow those characters in directory names.
  let evidenceDir: string;
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    evidenceDir = path.resolve(__dirname, `../evidence/evidence_${data.jobId}_${timestamp}`);
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
  } catch (fsError) {
    // EXCEPTION: fs.mkdirSync can throw if the disk is full, the path
    // contains illegal characters, or the process lacks write permissions
    // to the parent directory. We log the error and re-throw because
    // without an evidence directory, saving screenshots will fail on
    // every single round — there is no point continuing.
    broadcastLog('error', `Failed to create evidence directory: ${fsError}`);
    throw new Error(`[FILESYSTEM] Cannot create evidence directory for job ${data.jobId}: ${fsError}`);
  }

  try {
    broadcastLog('info', `Starting fixture execution for ${data.jobId} (Mode: ${data.mode})`);

    // ── Step 1: Initialize Browser ─────────────────────────────────────
    // Launch a headful Chromium instance via Playwright.
    // headless=false ensures the browser window is visible on screen,
    // which is required for visual QA observation during development.
    await engine.init(false);

    // ── Step 2: Navigate to Target ─────────────────────────────────────
    // Navigate to the game URL and wait for network idle, ensuring all
    // assets (JS, CSS, images, WebSocket connections) have finished loading
    // before we attempt any interactions.
    await engine.navigate(data.targetUrl);

    let roundsCompleted = 0;

    // ── Step 3: Main Execution Loop ────────────────────────────────────
    // This is the core automation loop. Each iteration represents one
    // complete "spin cycle" of the game under test.
    while (roundsCompleted < data.config.totalRounds) {
      broadcastLog('info', `--- Round ${roundsCompleted + 1} / ${data.config.totalRounds} ---`);

      // Step A: Trigger a spin action.
      // Currently uses a spacebar press as a universal fallback because
      // OpenCV template matching for the spin button is not yet integrated.
      // In a production build, this would be replaced by a vision-guided
      // click using matched coordinates from the template engine.
      await engine.fallbackClick();

      // Step B: Wait for the spin animation to resolve.
      // The roundIntervalMs value is configured per-job from the frontend.
      // This delay ensures we capture the "terminal state" (final reel
      // positions) rather than a mid-spin blur frame, which would cause
      // Gemini to hallucinate incorrect balance values.
      broadcastLog('info', `Waiting for spin resolution (${data.config.timing.roundIntervalMs}ms)`);
      await new Promise(res => setTimeout(res, data.config.timing.roundIntervalMs));

      // Step C: Capture the terminal state screenshot.
      broadcastLog('info', 'Capturing terminal state for OCR analysis...');
      const screenshotBuffer = await engine.captureScreenshot();

      // Step C.1: Persist screenshot to disk as forensic evidence.
      // This runs synchronously (writeFileSync) to guarantee the file is
      // fully written before we proceed. If the write fails, we log the
      // error but do NOT crash the loop — the in-memory buffer is still
      // valid and can be sent to Gemini for OCR analysis.
      try {
        const screenshotPath = path.resolve(evidenceDir, `round_${roundsCompleted + 1}.jpg`);
        fs.writeFileSync(screenshotPath, screenshotBuffer);
        broadcastLog('info', `Saved screenshot to ${screenshotPath}`);
      } catch (writeError) {
        // EXCEPTION: writeFileSync can fail if the disk is full, the file
        // is locked by another process (e.g., antivirus scanner), or the
        // evidence directory was deleted mid-execution. We log and continue
        // because the primary objective (OCR analysis) can still succeed
        // from the in-memory buffer.
        broadcastLog('warn', `Failed to save screenshot to disk for round ${roundsCompleted + 1}: ${writeError}. Continuing with in-memory buffer.`);
      }

      // Step D: Convert to base64 and send to Gemini 2.5 Pro for OCR.
      // The parseTerminalState function internally catches its own errors
      // and returns null on failure, so this call will never throw.
      const base64Image = screenshotBuffer.toString('base64');
      const ocrResult = await parseTerminalState(base64Image);

      if (!ocrResult) {
        // OCR returned null — this means either:
        //   (a) Gemini API returned an error (rate limit, network drop, safety block)
        //   (b) The response JSON could not be parsed
        //   (c) The API key is invalid or missing
        // The parseTerminalState function has already logged the specific
        // error internally. We assume a loss for this round and continue
        // to preserve the test's momentum.
        broadcastLog('warn', 'Failed to parse OCR result. Assuming loss and continuing.');
      } else {
        broadcastLog('success', `OCR Result: Win=${ocrResult.isWin}, Balance=${ocrResult.detectedBalance}, WinAmount=${ocrResult.detectedWinAmount}`);

        // Step E: Soft Assertion — Data Consistency Check.
        // If Gemini reports isWin=true but winAmount=0, the model is
        // contradicting itself. This is a known hallucination pattern
        // when the screenshot contains ambiguous visual states (e.g.,
        // a "near miss" animation). We log a warning but do not halt
        // execution because this is a data quality issue, not a fatal error.
        if (ocrResult.isWin && ocrResult.detectedWinAmount === 0) {
          broadcastLog('warn', 'Soft Assertion Failed: isWin=true but detectedWinAmount=0');
        }

        // Step F: Hard Halt — Low Balance Threshold Check.
        // If the player's balance drops below the configured threshold,
        // continuing to spin would be pointless (and potentially harmful
        // in a real-money test environment). We trigger the Dead Man's
        // Switch in the engine, which gives a human operator 3 minutes
        // to manually intervene before the process self-terminates.
        if (ocrResult.detectedBalance < data.config.lowBalanceHaltThreshold) {
          engine.triggerHardHalt(`Balance (${ocrResult.detectedBalance}) dropped below threshold (${data.config.lowBalanceHaltThreshold})`);
          // Return early — do NOT increment roundsCompleted.
          // The engine's Dead Man's Switch timer is now ticking.
          return;
        }
      }

      roundsCompleted++;
    }

    broadcastLog('success', `Job ${data.jobId} finished all ${data.config.totalRounds} rounds successfully.`);

  } catch (err: any) {
    // EXCEPTION: This outer catch handles any unrecoverable errors that
    // propagate up from Playwright (browser crash, navigation timeout,
    // target page returning HTTP 4xx/5xx), the filesystem, or unexpected
    // runtime errors. We broadcast the failure to the Next.js UI so the
    // operator sees it immediately, then re-throw so BullMQ marks the
    // job as "failed" in the Redis queue (enabling retry logic if configured).
    broadcastLog('error', `Execution failed: ${err.message}`);
    throw err;

  } finally {
    // CLEANUP: This block runs regardless of success, failure, or early return.
    // It closes the Playwright browser, context, and page to prevent zombie
    // Chromium processes from consuming system resources. The engine.cleanup()
    // method internally catches and swallows its own errors (e.g., if the
    // browser already crashed), so this call is safe and will never throw.
    await engine.cleanup();
  }
}

// =============================================================================
// MODULE SUMMARY
// =============================================================================
//
// fixtureRunner.ts is the Tier 3 execution engine of the SQA Harness. It
// receives a validated job payload from the BullMQ worker (index.ts), launches
// a headful Chromium browser via Playwright, and drives an automated spin loop
// against a target casino game URL. On each round, it triggers a spin action,
// waits for the animation to settle, captures a screenshot of the terminal
// state, saves it to disk inside the worker/evidence/ directory for
// forensic auditing, and then sends the image to Google's Gemini 2.5 Pro
// model for OCR extraction of financial metrics (balance, bet, win amount).
// It enforces two levels of safety: soft assertions that log data consistency
// warnings (e.g., isWin=true but winAmount=0), and a hard halt mechanism that
// activates a 3-minute Dead Man's Switch when the player's balance drops below
// a configured threshold, requiring human intervention before the process
// self-terminates. All screenshots, logs, and status updates are simultaneously
// broadcast over WebSocket to the Next.js control plane for real-time monitoring.
//
// =============================================================================
