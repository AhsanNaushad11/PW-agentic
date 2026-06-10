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
    activeClient.send(JSON.stringify({ type: 'ping' }));
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

// ─── BullMQ Worker ───────────────────────────────────────────────────────────
const worker = new Worker('sqa-jobs', async (job) => {
  broadcastLog('info', `Picked up job: ${job.id}`);
  
  try {
    await executeJob(job.data);
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
