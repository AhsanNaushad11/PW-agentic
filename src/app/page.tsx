'use client';

import React, { useState } from 'react';

/**
 * Tier 1: SQA Harness Frontend Control Plane
 * Implements a 3-panel layout: Main Control, Interaction Sidebar, and Evidence Bottom Bar.
 */
export default function Dashboard() {
  // Form State
  const [formData, setFormData] = useState({
    targetUrl: '',
    gameMode: 'slots',
    targetRounds: 100,
    spinIntervalMs: 5000,
    maxMemoryThresholdMb: 1500,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatusMessage(null);

    const payload = {
      targetUrl: formData.targetUrl,
      gameMode: formData.gameMode,
      config: {
        targetRounds: formData.targetRounds,
        spinIntervalMs: formData.spinIntervalMs,
        maxMemoryThresholdMb: formData.maxMemoryThresholdMb,
      },
    };

    try {
      const response = await fetch('/api/jobs/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Job submitted successfully:', result);
      setStatusMessage('Job dispatched successfully.');
    } catch (error) {
      console.error('Failed to dispatch job:', error);
      setStatusMessage('Failed to dispatch job. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="h-14 border-b border-slate-700 flex items-center px-6 shrink-0 bg-slate-900/50 backdrop-blur-sm z-10">
        <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <span className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse"></span>
          SQA HARNESS <span className="text-slate-500 font-normal text-sm ml-2">| CONTROL PLANE</span>
        </h1>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Panel 1: Main Control */}
        <main className="flex-1 overflow-y-auto p-6 border-r border-slate-700">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">Main Control</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4 bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                {/* Target URL */}
                <div>
                  <label htmlFor="targetUrl" className="block text-xs font-medium text-slate-400 mb-1">Target URL</label>
                  <input
                    id="targetUrl"
                    type="url"
                    required
                    placeholder="https://example.com/game"
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                    value={formData.targetUrl}
                    onChange={(e) => setFormData({ ...formData, targetUrl: e.target.value })}
                  />
                </div>

                {/* Game Mode */}
                <div>
                  <label htmlFor="gameMode" className="block text-xs font-medium text-slate-400 mb-1">Game Mode</label>
                  <select
                    id="gameMode"
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                    value={formData.gameMode}
                    onChange={(e) => setFormData({ ...formData, gameMode: e.target.value })}
                  >
                    <option value="slots">Slots</option>
                    <option value="crash">Crash</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Target Rounds */}
                  <div>
                    <label htmlFor="targetRounds" className="block text-xs font-medium text-slate-400 mb-1">Target Rounds</label>
                    <input
                      id="targetRounds"
                      type="number"
                      className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      value={formData.targetRounds}
                      onChange={(e) => setFormData({ ...formData, targetRounds: parseInt(e.target.value) })}
                    />
                  </div>

                  {/* Spin Interval */}
                  <div>
                    <label htmlFor="spinIntervalMs" className="block text-xs font-medium text-slate-400 mb-1">Spin Interval (ms)</label>
                    <input
                      id="spinIntervalMs"
                      type="number"
                      className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      value={formData.spinIntervalMs}
                      onChange={(e) => setFormData({ ...formData, spinIntervalMs: parseInt(e.target.value) })}
                    />
                  </div>

                  {/* Max Memory */}
                  <div>
                    <label htmlFor="maxMemoryThresholdMb" className="block text-xs font-medium text-slate-400 mb-1">Max Memory (MB)</label>
                    <input
                      id="maxMemoryThresholdMb"
                      type="number"
                      className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      value={formData.maxMemoryThresholdMb}
                      onChange={(e) => setFormData({ ...formData, maxMemoryThresholdMb: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-3 px-4 rounded font-bold text-sm tracking-wide transition-all ${
                  isLoading
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white shadow-lg shadow-indigo-500/20'
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    DISPATCHING...
                  </span>
                ) : 'RUN SQA TEST'}
              </button>

              {statusMessage && (
                <div className={`text-center text-xs p-2 rounded border ${statusMessage.includes('Error') || statusMessage.includes('Failed') ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-green-500/10 border-green-500/50 text-green-400'}`}>
                  {statusMessage}
                </div>
              )}
            </form>
          </div>
        </main>

        {/* Panel 2: Interaction Sidebar */}
        <aside className="w-80 overflow-hidden flex flex-col bg-slate-900">
          <div className="p-4 border-b border-slate-700 shrink-0">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">System Interventions & Logs</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-2 bg-black/20">
            <div className="text-indigo-400">[08:42:01] SYSTEM: Initializing Playwright environment...</div>
            <div className="text-slate-300">[08:42:03] WORKER_01: Redis connection established.</div>
            <div className="text-slate-300">[08:42:05] WORKER_01: Waiting for job assignment...</div>
            <div className="text-green-400">[08:42:10] SYSTEM: Tier 2 Queue is healthy.</div>
            <div className="text-slate-500 italic">-- End of mock logs --</div>
          </div>
        </aside>

      </div>

      {/* Panel 3: Evidence Bottom Bar */}
      <footer className="h-48 border-t border-slate-700 bg-slate-900 flex flex-col shrink-0">
        <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Latest Extraction Evidence</h2>
          <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">3 ASSETS STORED</span>
        </div>
        <div className="flex-1 overflow-x-auto flex items-center gap-4 p-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {/* Mock Card 1 */}
          <div className="min-w-[240px] h-full bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden group">
            <div className="flex-1 bg-slate-700 relative overflow-hidden">
               <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500 font-mono">IMAGE_PREVIEW_MOCK</div>
               <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] text-slate-300">canvas_state_001.png</span>
               </div>
            </div>
            <div className="h-10 px-2 flex items-center justify-between bg-slate-900/50">
               <span className="text-[10px] font-mono text-indigo-400">STATE_SNAPSHOT</span>
               <button className="text-[9px] text-slate-500 hover:text-slate-300">VIEW JSON</button>
            </div>
          </div>

          {/* Mock Card 2 */}
          <div className="min-w-[240px] h-full bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden group">
            <div className="flex-1 bg-slate-700 relative overflow-hidden text-[10px] p-3 font-mono text-slate-400 overflow-y-auto">
               <pre>{JSON.stringify({ "spin_result": "win", "payout": 25.00, "symbols": ["cherry", "cherry", "bar"] }, null, 2)}</pre>
            </div>
            <div className="h-10 px-2 flex items-center justify-between bg-slate-900/50 border-t border-slate-700">
               <span className="text-[10px] font-mono text-green-400">EXTRACTION_JSON</span>
               <button className="text-[9px] text-slate-500 hover:text-slate-300">DOWNLOAD</button>
            </div>
          </div>

          {/* Mock Card 3 */}
          <div className="min-w-[240px] h-full bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden group">
            <div className="flex-1 bg-slate-700 relative overflow-hidden">
               <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500 font-mono">IMAGE_PREVIEW_MOCK</div>
               <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] text-slate-300">canvas_state_002.png</span>
               </div>
            </div>
            <div className="h-10 px-2 flex items-center justify-between bg-slate-900/50">
               <span className="text-[10px] font-mono text-indigo-400">STATE_SNAPSHOT</span>
               <button className="text-[9px] text-slate-500 hover:text-slate-300">VIEW JSON</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
