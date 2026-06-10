'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUiStore } from '@/store/uiStore';
import { useTranslation } from 'react-i18next';
import '../lib/i18n';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Home() {
  const { t } = useTranslation();
  const {
    wsConnected,
    logs,
    workerState,
    activeJobId,
    setWsConnected,
    addLog,
    updateWorkerState,
    setActiveJobId,
    clearLogs,
  } = useUiStore();

  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('fixture_driven');
  const [totalRounds, setTotalRounds] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to Tier 3 Worker WebSocket
    const connectWs = () => {
      const ws = new WebSocket('ws://localhost:5000');
      
      ws.onopen = () => {
        setWsConnected(true);
        addLog('success', 'Connected to Worker WebSocket.');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'log') {
            addLog(data.level, data.message);
          } else if (data.type === 'ping') {
            updateWorkerState({ lastPing: Date.now() });
            ws.send(JSON.stringify({ type: 'pong' }));
          } else if (data.type === 'status') {
            updateWorkerState({ status: data.status, memoryUsageMb: data.memoryUsageMb });
          } else if (data.type === 'screenshot') {
            setScreenshotBase64(data.base64);
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        addLog('error', 'Disconnected from Worker WebSocket. Retrying in 5s...');
        setTimeout(connectWs, 5000);
      };

      wsRef.current = ws;
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [setWsConnected, addLog, updateWorkerState]);

  const handleRun = useCallback(async () => {
    if (!url.trim()) return;

    setIsSubmitting(true);
    clearLogs();
    setScreenshotBase64(null);

    addLog('info', 'Submitting job to Queue (Tier 2)...');

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url,
          mode,
          config: {
            totalRounds,
            lowBalanceHaltThreshold: 1.0,
            timing: { roundIntervalMs: 5000, visibilityWindowMs: 2500 }
          }
        }),
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to submit job');
      
      setActiveJobId(data.jobId);
      addLog('success', `Job successfully queued: ${data.jobId}`);
    } catch (err: any) {
      addLog('error', `Submission error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [url, mode, totalRounds, addLog, clearLogs, setActiveJobId]);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-indigo-400 tracking-tight">⚡ PW Agentic</span>
          <span className="text-xs text-gray-400 border-l border-gray-600 pl-3">Automated SQA Harness</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-400">Worker WS: {wsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Worker RAM: {workerState.memoryUsageMb.toFixed(1)} MB</span>
          </div>
        </div>
      </header>

      {/* ── Main Layout (3 Panels) ──────────────────────────────────────── */}
      <main className="flex flex-1 gap-1 bg-gray-700 overflow-hidden">
        
        {/* Left Panel: Configuration */}
        <section className="flex-1 flex flex-col gap-4 p-4 bg-gray-900 min-w-[300px]">
          <div className="flex items-center justify-between pb-2 border-b border-gray-800 shrink-0">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{t('config')}</span>
          </div>

          <div className="flex flex-col gap-1.5 shrink-0">
            <label className="text-xs font-medium text-gray-400">{t('targetUrl')}</label>
            <input
              className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              type="url"
              placeholder="https://casino.example.com/game"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-1.5 shrink-0">
            <label className="text-xs font-medium text-gray-400">{t('executionMode')}</label>
            <select
              className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="fixture_driven">{t('fixtureDriven')}</option>
              <option value="autonomous_learning">{t('autonomousLearning')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5 shrink-0">
            <label className="text-xs font-medium text-gray-400">{t('totalRounds')}</label>
            <input
              className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              type="number"
              min="1"
              value={totalRounds}
              onChange={(e) => setTotalRounds(parseInt(e.target.value, 10) || 1)}
              disabled={isSubmitting}
            />
          </div>

          <button
            className={`mt-auto px-5 py-3 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0
              ${(!url.trim() || isSubmitting) ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
            onClick={handleRun}
            disabled={!url.trim() || isSubmitting}
          >
            {isSubmitting ? t('queuing') : `▶ ${t('enqueueJob')}`}
          </button>
        </section>

        {/* Middle Panel: Real-time Logs */}
        <section className="flex-[1.5] flex flex-col p-4 bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-gray-800 shrink-0">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Execution Logs</span>
            <span className="text-xs text-gray-500">Job: {activeJobId || 'None'}</span>
          </div>

          <div className="flex-1 overflow-y-auto mt-2 flex flex-col gap-1 font-mono text-[13px] bg-gray-800 p-3 rounded-md border border-gray-800">
            {logs.length === 0 ? (
              <span className="text-gray-500">Waiting for logs...</span>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className={`flex gap-3 leading-relaxed
                  ${entry.type === 'success' ? 'text-green-400' : ''}
                  ${entry.type === 'error' ? 'text-red-400' : ''}
                  ${entry.type === 'warn' ? 'text-amber-400' : ''}
                  ${entry.type === 'info' ? 'text-gray-300' : ''}
                `}>
                  <span className="text-gray-500 shrink-0 select-none">{entry.time}</span>
                  <span className="break-words">{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right Panel: Vision & Evidence */}
        <section className="flex-1 flex flex-col p-4 bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-gray-800 shrink-0">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Vision / OCR Evidence</span>
          </div>

          <div className="flex-1 flex items-center justify-center mt-2 border border-dashed border-gray-700 rounded-md bg-gray-800 overflow-hidden relative">
            {screenshotBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src={`data:image/jpeg;base64,${screenshotBase64}`} 
                alt="Terminal State Evidence" 
                className="object-contain w-full h-full"
              />
            ) : (
              <span className="text-gray-500 text-sm">No evidence captured yet.</span>
            )}
            
            {/* Overlay Status */}
            <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-xs text-gray-300 backdrop-blur-sm border border-gray-700">
              Worker Status: <span className="text-white capitalize">{workerState.status}</span>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
