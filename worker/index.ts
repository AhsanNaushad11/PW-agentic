import * as dotenv from 'dotenv';
dotenv.config();

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { WebSocketServer, WebSocket } from 'ws';
import { executeJob } from './core/fixtureRunner';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '5000', 10);
const MEMORY_LIMIT_MB = 1500; // 1.5 GB

// ─── Redis Connection ────────────────────────────────────────────────────────
const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  console.error(`[REDIS] Connection error: ${err.message}`);
});

connection.on('connect', () => {
  console.log(`[REDIS] Connected to ${REDIS_HOST}:${REDIS_PORT}`);
});

// ─── WebSocket Server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT });

let activeClient: WebSocket | null = null;
let pingInterval: NodeJS.Timeout | null = null;
let pongReceived = true;
let missedPongs = 0;

wss.on('connection', (ws) => {
  console.log('Frontend connected to Worker WS.');
  activeClient = ws;
  pongReceived = true;
  missedPongs = 0;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'pong') {
        pongReceived = true;
        missedPongs = 0;
      }
    } catch (e) {
      // ignore
    }
  });

  ws.on('close', () => {
    console.log('Frontend disconnected.');
    activeClient = null;
  });
});

// Broadcast helper
export function broadcastLog(level: 'info' | 'success' | 'error' | 'warn', message: string) {
  if (activeClient && activeClient.readyState === WebSocket.OPEN) {
    activeClient.send(JSON.stringify({ type: 'log', level, message }));
  }
  console.log(`[${level.toUpperCase()}] ${message}`);
}

export function broadcastStatus(status: string, memoryUsageMb: number) {
  if (activeClient && activeClient.readyState === WebSocket.OPEN) {
    activeClient.send(JSON.stringify({ type: 'status', status, memoryUsageMb }));
  }
}

export function broadcastScreenshot(base64: string) {
  if (activeClient && activeClient.readyState === WebSocket.OPEN) {
    activeClient.send(JSON.stringify({ type: 'screenshot', base64 }));
  }
}

// Zombie Worker Prevention (10s Heartbeat)
pingInterval = setInterval(() => {
  if (activeClient && activeClient.readyState === WebSocket.OPEN) {
    if (!pongReceived) {
      missedPongs++;
      if (missedPongs >= 2) {
        console.error('CRITICAL: Missed 2 consecutive PONGs. UI disconnected. Aborting worker to prevent zombie state.');
        process.exit(1);
      }
    }
    
    pongReceived = false;
    try {
      activeClient.send(JSON.stringify({ type: 'ping' }));
    } catch (e) {
      console.error('[WS] Failed to send ping:', e);
    }
  }
}, 10000);

// Memory Protection Check (Every 10s roughly, could also be per-spin)
setInterval(() => {
  const memoryUsageMb = process.memoryUsage().rss / 1024 / 1024;
  if (memoryUsageMb > MEMORY_LIMIT_MB) {
    broadcastLog('error', `CRITICAL: Memory exceeded 1.5GB (${memoryUsageMb.toFixed(1)}MB). Aborting to prevent crash.`);
    process.exit(1);
  }
  broadcastStatus('running', memoryUsageMb);
}, 10000);

// ─── Payload Translation Layer ───────────────────────────────────────────────
// The API route (Tier 1) enqueues:
//   { targetUrl, gameMode, executionParameters: { targetRounds, spinIntervalMs, maxMemoryThresholdMb } }
//
// The fixtureRunner (Tier 3) expects:
//   { jobId, targetUrl, mode, config: { totalRounds, lowBalanceHaltThreshold, timing: { roundIntervalMs, visibilityWindowMs } } }
//
// This function bridges the contract gap without touching either endpoint.
// ─────────────────────────────────────────────────────────────────────────────
function translatePayload(jobId: string, raw: any) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`[VALIDATION] Job ${jobId} has a null or non-object payload.`);
  }
  if (!raw.targetUrl) {
    throw new Error(`[VALIDATION] Job ${jobId} is missing required field: targetUrl.`);
  }
  const ep = raw.executionParameters || {};
  return {
    jobId,
    targetUrl: raw.targetUrl,
    mode: raw.gameMode,
    config: {
      totalRounds: ep.targetRounds ?? 1,
      lowBalanceHaltThreshold: ep.lowBalanceHaltThreshold ?? 0,
      timing: {
        roundIntervalMs: ep.spinIntervalMs ?? 5000,
        visibilityWindowMs: ep.visibilityWindowMs ?? 2500,
      },
    },
  };
}

// ─── BullMQ Worker ───────────────────────────────────────────────────────────
const worker = new Worker('sqa-jobs', async (job) => {
  broadcastLog('info', `Picked up job: ${job.id}`);
  
  try {
    const translatedData = translatePayload(job.id ?? 'unknown', job.data);
    await executeJob(translatedData);
    broadcastLog('success', `Job ${job.id} completed.`);
  } catch (error: any) {
    broadcastLog('error', `Job ${job.id} failed: ${error.message}`);
    throw error;
  }
}, { connection: connection as any });

worker.on('ready', () => {
  console.log(`Worker listening for jobs. WS Server running on port ${WS_PORT}.`);
});

worker.on('error', (err) => {
  console.error('Worker Redis error:', err);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
// When the process receives SIGTERM (VS Code Stop, systemd) or SIGINT (Ctrl+C),
// we must close the worker gracefully. worker.close() waits for the currently
// running job to finish, then disconnects from Redis. Without this, in-flight
// jobs get stuck in the "active" state and Playwright browsers become zombies.
// Redis (Tier 2) is NEVER touched — it runs as a system-level daemon.
// ─────────────────────────────────────────────────────────────────────────────
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[SHUTDOWN] Received ${signal}. Closing worker gracefully...`);
  try {
    if (pingInterval) clearInterval(pingInterval);
    await worker.close();
    await connection.quit();
    wss.close();
    console.log('[SHUTDOWN] Worker, Redis connection, and WebSocket closed cleanly.');
  } catch (err) {
    console.error('[SHUTDOWN] Error during graceful shutdown:', err);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Global Safety Net ───────────────────────────────────────────────────────
// Last-resort handlers to log crashes that escape all other error handling.
// These prevent silent process deaths in production.
// ─────────────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  // Exit after logging — the process is in an unknown state and continuing
  // could cause data corruption or zombie Playwright browsers.
  process.exit(1);
});
