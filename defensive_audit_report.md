# Defensive Static Audit Report — Tier 3 Worker

**Audit Date:** 2026-06-15  
**Scope:** All files under `worker/` that participate in the active runtime (`npm run dev` → `ts-node index.ts`)

---

## Files Audited

| File | Verdict |
|------|---------|
| [index.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/index.ts) | 🔴 **6 vulnerabilities found** |
| [core/fixtureRunner.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/core/fixtureRunner.ts) | 🟡 **1 vulnerability found** |
| [core/playwrightEngine.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/core/playwrightEngine.ts) | 🟢 AUDIT PASS |
| [vision/ocr.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/vision/ocr.ts) | 🔴 **2 vulnerabilities found** |
| [vision/matcher.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/vision/matcher.ts) | 🟢 AUDIT PASS |
| [worker.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/worker.ts) (inactive) | 🟢 AUDIT PASS |
| [src/ai/GeminiVisionProvider.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/src/ai/GeminiVisionProvider.ts) | 🟢 AUDIT PASS |
| [src/automation/BrowserManager.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/src/automation/BrowserManager.ts) | 🟢 AUDIT PASS |

---

## Vector 1: Data Contract Boundary (Undefined Access)

### VULN-1: [index.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/index.ts#L105-L120) — `translatePayload()` trusts raw input without null guard

**What would crash:** If a malformed job with `job.data = null` or `job.data = "string"` is enqueued (e.g. by a different producer or a Redis corruption), `raw.executionParameters` throws `TypeError: Cannot read properties of null`.

**Patch:** Add explicit null guard at entry.

```diff
 function translatePayload(jobId: string, raw: any) {
+  if (!raw || typeof raw !== 'object') {
+    throw new Error(`[VALIDATION] Job ${jobId} has a null or non-object payload.`);
+  }
+  if (!raw.targetUrl) {
+    throw new Error(`[VALIDATION] Job ${jobId} is missing required field: targetUrl.`);
+  }
   const ep = raw.executionParameters || {};
```

---

### VULN-2: [fixtureRunner.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/core/fixtureRunner.ts#L33) — Deep property chain `data.config.timing.roundIntervalMs` accessed without guarding `timing`

**What would crash:** If the translation layer is bypassed or `timing` is undefined due to a future refactor, accessing `.roundIntervalMs` on undefined crashes the worker mid-loop.

**Patch:** Add defensive guard at function entry.

```diff
 export async function executeJob(data: JobData) {
+  // Defensive: validate the deeply nested config structure before entering the loop
+  if (!data?.config?.timing) {
+    throw new Error(`[VALIDATION] Job ${data?.jobId} has malformed config — missing config.timing.`);
+  }
   const engine = new PlaywrightEngine();
```

---

## Vector 2: Unhandled Async Rejections (The Silent Crash)

### VULN-3: [index.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/index.ts#L12-L16) — Redis connection failure is completely unhandled

**What would crash:** If Redis is down when the worker boots, `new IORedis()` emits an `error` event. Without a listener, Node.js treats this as an unhandled error and immediately terminates the process with no diagnostic output.

**Patch:** Add error and connect event listeners.

```diff
 const connection = new IORedis({
   host: REDIS_HOST,
   port: REDIS_PORT,
   maxRetriesPerRequest: null,
 });
+
+connection.on('error', (err) => {
+  console.error(`[REDIS] Connection error: ${err.message}`);
+});
+
+connection.on('connect', () => {
+  console.log(`[REDIS] Connected to ${REDIS_HOST}:${REDIS_PORT}`);
+});
```

### VULN-4: [index.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/index.ts#L82) — WebSocket `send()` can throw on race condition

**What would crash:** If `activeClient.readyState` is `OPEN` at the moment of the check but transitions to `CLOSING` before `.send()` executes (race condition during heartbeat), the `send()` throws an unhandled exception inside a `setInterval`, crashing the process.

**Patch:** Wrap all `send()` calls in try/catch. The broadcast helpers already guard `readyState`, but the raw `send()` on line 82 inside the heartbeat interval does not.

```diff
     pongReceived = false;
-    activeClient.send(JSON.stringify({ type: 'ping' }));
+    try {
+      activeClient.send(JSON.stringify({ type: 'ping' }));
+    } catch (e) {
+      console.error('[WS] Failed to send ping:', e);
+    }
```

---

## Vector 3: Lifecycle Teardown (Zombie Process Prevention)

### VULN-5: [index.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/index.ts) — No SIGTERM/SIGINT handlers exist

**What would crash:** When VS Code's Stop button sends `SIGTERM`, the Node process dies instantly. Any in-flight Playwright browser is orphaned as a zombie Chromium process. The BullMQ worker connection is severed without calling `worker.close()`, leaving the active job stuck in BullMQ's "active" state forever (it will never be retried).

> [!CAUTION]
> This is the most critical vulnerability. The mature `worker.ts` has full graceful shutdown handlers, but the **active** `index.ts` has **zero**.

**Patch:** Add shutdown handlers and global safety nets at the bottom of `index.ts`.

```typescript
// ─── Graceful Shutdown ───────────────────────────────────────────────────────
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[SHUTDOWN] Received ${signal}. Closing worker gracefully...`);
  try {
    if (pingInterval) clearInterval(pingInterval);
    await worker.close();
    await connection.quit();
    wss.close();
    console.log('[SHUTDOWN] Worker, Redis, and WebSocket closed cleanly.');
  } catch (err) {
    console.error('[SHUTDOWN] Error during graceful shutdown:', err);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Global Safety Net ───────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});
```

---

## Vector 4: Environment Boot Order

### VULN-6: [vision/ocr.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/vision/ocr.ts#L1-L3) — `dotenv` is never called; `GoogleGenAI` is instantiated at module load with a possibly-undefined API key

**What would crash:** `ocr.ts` instantiates `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })` at **module load time** (line 3), before any `dotenv.config()` call. Since `index.ts` (the entry point) never calls `dotenv.config()` either, `GEMINI_API_KEY` is always `undefined` unless manually exported in the shell. The SDK initialization with `undefined` produces the "API key should be set" warnings we saw during boot.

**Patch (ocr.ts):** Defer SDK initialization to call-time, not module-load time.

```diff
-const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
+// DEFERRED: SDK is initialized at call-time, not module-load time,
+// to ensure dotenv.config() in the entry point has already executed.
+let _ai: GoogleGenAI | null = null;
+function getAiClient(): GoogleGenAI {
+  if (!_ai) {
+    const apiKey = process.env.GEMINI_API_KEY;
+    if (!apiKey) {
+      throw new Error('[OCR] GEMINI_API_KEY is not set. Cannot initialize GoogleGenAI.');
+    }
+    _ai = new GoogleGenAI({ apiKey });
+  }
+  return _ai;
+}
```

Then inside `parseTerminalState`, replace `ai.models.generateContent` with `getAiClient().models.generateContent`.

**Patch (index.ts):** Add `dotenv.config()` as the very first executable line, before any imports that read `process.env`.

```diff
+import * as dotenv from 'dotenv';
+dotenv.config();
+
 import { Worker } from 'bullmq';
 import IORedis from 'ioredis';
```

---

## Files That Pass Audit

### [playwrightEngine.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/core/playwrightEngine.ts) — AUDIT PASS
- All public methods guard `this.page` with null checks before access.
- `cleanup()` uses `.catch(() => {})` on all teardown calls to prevent throw-on-close.
- Dead Man's Switch timer is properly cleared in cleanup.

### [matcher.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/vision/matcher.ts) — AUDIT PASS
- Entire body is wrapped in try/catch.
- Returns `null` on failure instead of throwing.

### [worker.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/worker.ts) (inactive entry point) — AUDIT PASS
- Has SIGTERM/SIGINT handlers with graceful shutdown.
- Has `unhandledRejection` and `uncaughtException` safety nets.
- Has payload validation guard before destructuring.
- Has Redis error event listener.
- Has `finally` block with unconditional browser teardown + screenshot purge.

### [GeminiVisionProvider.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/src/ai/GeminiVisionProvider.ts) — AUDIT PASS
- Calls `dotenv.config()` at module load (correct boot order for its own context).
- Guards `GEMINI_API_KEY` with explicit throw before SDK init.
- Wraps API call, safety-filter response, and JSON parse each in separate try/catch blocks.
- Explicitly nulls the image buffer in `finally` for GC pressure relief.

### [BrowserManager.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/src/automation/BrowserManager.ts) — AUDIT PASS
- `close()` wraps page, context, and browser teardown each in individual try/catch/finally blocks.
- Memory guardrail calls `close()` before throwing to prevent orphaned browsers.
- Dialog handler auto-dismisses unexpected popups.

---

## Summary

| Vector | Vulns Found | Files Affected |
|--------|-------------|----------------|
| Data Contract Boundary | 2 | index.ts, fixtureRunner.ts |
| Unhandled Async Rejections | 2 | index.ts (Redis + WS send) |
| Lifecycle Teardown | 1 | index.ts (no SIGTERM/SIGINT) |
| Environment Boot Order | 2 | index.ts (no dotenv), ocr.ts (eager SDK init) |
| **Total** | **9** | **3 files** |

> [!IMPORTANT]
> The mature [worker.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/worker.ts) already has all of these defenses. The active [index.ts](file:///mnt/fc25c7c0-5817-46f0-8e36-625e912f305f/Projects/PW-agentic/worker/index.ts) lacks them because it was written as a lightweight bootstrap and never received the same hardening pass. The recommended path is to either port the defenses from `worker.ts` into `index.ts`, or migrate the entry point to `worker.ts` entirely.
