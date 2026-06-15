'use client';

import React, { useState } from 'react';
import ConsolePanel from '@/components/ConsolePanel';

// =============================================================================
// TIER 1: SQA HARNESS FRONTEND CONTROL PLANE
// =============================================================================
// This is the main dashboard for the SQA Harness. It implements a strict
// 3-panel Tailwind CSS grid layout:
//   Panel 1 (Main Control): Job configuration form — dispatches SQA test runs.
//   Panel 2 (Sidebar):      Real-time system interventions & log feed.
//   Panel 3 (Bottom Bar):   Evidence viewer for extraction artifacts.
//
// DATA CONTRACT: The form payload MUST align exactly with the Tier 3 Worker's
// `SqaJobPayload` interface defined in `worker/src/types/job.types.ts`.
// Any deviation will cause silent job failures on the BullMQ consumer side.
// =============================================================================

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

/**
 * Represents the shape of the form's internal state.
 * Maps 1:1 to the flattened fields rendered in the UI.
 */
interface DashboardFormState {
  /** The full URL of the canvas game to be tested. */
  targetUrl: string;
  /** The game vertical being tested. Must match worker's GameMode union. */
  gameMode: 'slot' | 'crash' | 'plinko';
  /** Number of automation rounds (spins/bets) the worker should execute. */
  targetRounds: number;
  /** Milliseconds to wait between each round for animation settling. */
  spinIntervalMs: number;
  /** RSS memory ceiling in MB — worker hard-halts if exceeded. */
  maxMemoryThresholdMb: number;
}

/**
 * The wire-format payload dispatched to the Tier 2 API route.
 * This MUST match the `SqaJobPayload` interface consumed by the Tier 3 Worker.
 */
interface SqaJobDispatchPayload {
  targetUrl: string;
  gameMode: 'slot' | 'crash' | 'plinko';
  executionParameters: {
    targetRounds: number;
    spinIntervalMs: number;
    maxMemoryThresholdMb: number;
  };
}

/**
 * Shape of the JSON response returned by the Tier 2 API route.
 */
interface ApiJobResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

/**
 * Dashboard — The Tier 1 Control Plane for the SQA Harness.
 *
 * Renders a 3-panel layout:
 * - Main Control: Form to configure and dispatch SQA test jobs.
 * - Interaction Sidebar: Placeholder for real-time log streaming.
 * - Evidence Bottom Bar: Placeholder for extraction artifact previews.
 *
 * On submit, the form state is transformed into an `SqaJobDispatchPayload`
 * and POSTed to `/api/jobs/execute`, which enqueues it into Redis/BullMQ.
 */
export default function Dashboard() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Form field values, initialized with SRS-mandated safe defaults. */
  const [formData, setFormData] = useState<DashboardFormState>({
    targetUrl: '',
    gameMode: 'slot',
    targetRounds: 100,
    spinIntervalMs: 5000,
    maxMemoryThresholdMb: 1500,
  });

  /** Tracks whether the dispatch request is in-flight. */
  const [isLoading, setIsLoading] = useState(false);

  /** User-facing status message after dispatch attempt. Null = hidden. */
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handles form submission by transforming internal state into the
   * `SqaJobDispatchPayload` wire format and dispatching it to the Tier 2
   * API route via a POST request.
   *
   * CRITICAL: The payload key MUST be `executionParameters`, NOT `config`.
   * The Tier 3 Worker destructures `job.data.executionParameters` directly.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatusMessage(null);

    // Transform flat form state → nested wire-format payload.
    // This is the single source of truth for the data contract between
    // Tier 1 (Frontend) → Tier 2 (API/Queue) → Tier 3 (Worker).
    const payload: SqaJobDispatchPayload = {
      targetUrl: formData.targetUrl,
      gameMode: formData.gameMode,
      executionParameters: {
        targetRounds: formData.targetRounds,
        spinIntervalMs: formData.spinIntervalMs,
        maxMemoryThresholdMb: formData.maxMemoryThresholdMb,
      },
    };

    try {
      const response = await fetch('/api/jobs/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // GUARD: Parse the response body regardless of status code.
      // The API route returns structured JSON errors for 400/500 responses.
      const result: ApiJobResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      console.log('[Tier 1] Job dispatched successfully:', result);
      setStatusMessage(`Job dispatched successfully. ID: ${result.jobId}`);
    } catch (error) {
      // GUARD: Catch both network failures and API-level errors.
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Tier 1] Failed to dispatch job:', message);
      setStatusMessage(`Failed to dispatch job: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Generic handler for numeric input fields. Safely parses the value
   * and falls back to 0 if the user clears the field (avoids NaN state).
   */
  const handleNumericChange = (field: keyof DashboardFormState, value: string) => {
    const parsed = parseInt(value, 10);
    setFormData({ ...formData, [field]: isNaN(parsed) ? 0 : parsed });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* ================================================================= */}
      {/* HEADER: Global application chrome                                 */}
      {/* ================================================================= */}
      <header className="h-14 border-b border-slate-700 flex items-center px-6 shrink-0 bg-slate-900/50 backdrop-blur-sm z-10">
        <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <span className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse"></span>
          SQA HARNESS <span className="text-slate-500 font-normal text-sm ml-2">| CONTROL PLANE</span>
        </h1>
      </header>

      {/* ================================================================= */}
      {/* MAIN CONTAINER: 2-column layout (Panel 1 + Panel 2)               */}
      {/* ================================================================= */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* =============================================================== */}
        {/* PANEL 1: MAIN CONTROL — Job Configuration Form                  */}
        {/* =============================================================== */}
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

                {/* Game Mode — Values MUST match the worker's GameMode union type */}
                <div>
                  <label htmlFor="gameMode" className="block text-xs font-medium text-slate-400 mb-1">Game Mode</label>
                  <select
                    id="gameMode"
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                    value={formData.gameMode}
                    onChange={(e) => setFormData({ ...formData, gameMode: e.target.value as DashboardFormState['gameMode'] })}
                  >
                    <option value="slot">Slot</option>
                    <option value="crash">Crash</option>
                    <option value="plinko">Plinko</option>
                  </select>
                </div>

                {/* Execution Parameters — Numeric Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Target Rounds */}
                  <div>
                    <label htmlFor="targetRounds" className="block text-xs font-medium text-slate-400 mb-1">Target Rounds</label>
                    <input
                      id="targetRounds"
                      type="number"
                      min={1}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      value={formData.targetRounds}
                      onChange={(e) => handleNumericChange('targetRounds', e.target.value)}
                    />
                  </div>

                  {/* Spin Interval */}
                  <div>
                    <label htmlFor="spinIntervalMs" className="block text-xs font-medium text-slate-400 mb-1">Spin Interval (ms)</label>
                    <input
                      id="spinIntervalMs"
                      type="number"
                      min={3000}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      value={formData.spinIntervalMs}
                      onChange={(e) => handleNumericChange('spinIntervalMs', e.target.value)}
                    />
                  </div>

                  {/* Max Memory */}
                  <div>
                    <label htmlFor="maxMemoryThresholdMb" className="block text-xs font-medium text-slate-400 mb-1">Max Memory (MB)</label>
                    <input
                      id="maxMemoryThresholdMb"
                      type="number"
                      min={256}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      value={formData.maxMemoryThresholdMb}
                      onChange={(e) => handleNumericChange('maxMemoryThresholdMb', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
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

              {/* Status Message — Conditionally rendered after dispatch attempt */}
              {statusMessage && (
                <div className={`text-center text-xs p-2 rounded border ${
                  statusMessage.includes('Failed')
                    ? 'bg-red-500/10 border-red-500/50 text-red-400'
                    : 'bg-green-500/10 border-green-500/50 text-green-400'
                }`}>
                  {statusMessage}
                </div>
              )}
            </form>
          </div>
        </main>

        {/* =============================================================== */}
        {/* PANEL 2: INTERACTION SIDEBAR — System Logs & Interventions      */}
        {/* Currently renders mock log entries. Will be replaced with a     */}
        {/* real-time WebSocket or SSE feed from the Tier 3 Worker.         */}
        {/* =============================================================== */}
        <aside className="w-80 overflow-hidden flex flex-col bg-slate-900">
          <div className="p-4 border-b border-slate-700 shrink-0">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">System Interventions &amp; Logs</h2>
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

      {/* =================================================================== */}
      {/* PANEL 3: EVIDENCE BOTTOM BAR — Extraction Artifact Previews         */}
      {/* Displays screenshot snapshots and JSON extraction results from the   */}
      {/* most recent SQA test run. Currently renders mock placeholder cards.  */}
      {/* =================================================================== */}
      <footer className="h-48 border-t border-slate-700 bg-slate-900 flex flex-col shrink-0">
        <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Latest Extraction Evidence</h2>
          <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">3 ASSETS STORED</span>
        </div>
        <div className="flex-1 overflow-x-auto flex items-center gap-4 p-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {/* Mock Card 1: Canvas State Snapshot */}
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

          {/* Mock Card 2: Extraction JSON Preview */}
          <div className="min-w-[240px] h-full bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden group">
            <div className="flex-1 bg-slate-700 relative overflow-hidden text-[10px] p-3 font-mono text-slate-400 overflow-y-auto">
               <pre>{JSON.stringify({ "spin_result": "win", "payout": 25.00, "symbols": ["cherry", "cherry", "bar"] }, null, 2)}</pre>
            </div>
            <div className="h-10 px-2 flex items-center justify-between bg-slate-900/50 border-t border-slate-700">
               <span className="text-[10px] font-mono text-green-400">EXTRACTION_JSON</span>
               <button className="text-[9px] text-slate-500 hover:text-slate-300">DOWNLOAD</button>
            </div>
          </div>

          {/* Mock Card 3: Canvas State Snapshot */}
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

      {/* =================================================================== */}
      {/* PANEL 4: EXECUTION CONSOLE — Real-time terminal logs                */}
      {/* =================================================================== */}
      <ConsolePanel />
    </div>
  );
}
