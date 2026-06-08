'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Monaco editor must be client-only (no SSR)
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div style={styles.editorPlaceholder}>Loading editor...</div>
  ),
});

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase =
  | 'idle'
  | 'generating'
  | 'executing'
  | 'fixing'
  | 'success'
  | 'failed';

interface LogEntry {
  time: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

const MAX_RETRIES = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function phaseLabel(phase: Phase, attempt: number): string {
  switch (phase) {
    case 'idle': return 'Ready';
    case 'generating': return attempt === 1 ? 'Generating script…' : `Fix attempt ${attempt - 1} — Generating…`;
    case 'executing': return `Executing (attempt ${attempt})…`;
    case 'fixing': return `Fixing — attempt ${attempt} of ${MAX_RETRIES}…`;
    case 'success': return '✅ Passed';
    case 'failed': return '❌ Could not fix after max retries';
    default: return '';
  }
}

function phaseColor(phase: Phase): string {
  switch (phase) {
    case 'success': return '#22c55e';
    case 'failed': return '#ef4444';
    case 'executing': return '#f59e0b';
    default: return '#7c6af7';
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Home() {
  const [testCase, setTestCase] = useState('');
  const [url, setUrl] = useState('');
  const [script, setScript] = useState('// Generated script will appear here…');
  const [phase, setPhase] = useState<Phase>('idle');
  const [attempt, setAttempt] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(true);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs((prev) => [...prev, { time: timestamp(), type, message }]);
  }, []);

  const handleRun = useCallback(async () => {
    if (!testCase.trim() || !url.trim()) return;

    setLogs([]);
    setScript('');
    setPhase('generating');
    setAttempt(1);

    let currentAttempt = 1;
    let errorContext: string | undefined = undefined;

    while (currentAttempt <= MAX_RETRIES) {
      // ── Step 1: Generate ─────────────────────────────────────────────────
      setPhase('generating');
      setAttempt(currentAttempt);
      addLog('info', currentAttempt === 1
        ? 'Sending test case to Ollama (kimi-k2:cloud)…'
        : `Sending error context to Ollama for fix (attempt ${currentAttempt})…`
      );

      let generatedScript = '';
      try {
        const genRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testCase, url, errorContext }),
        });
        const genData = await genRes.json();
        if (!genRes.ok || genData.error) throw new Error(genData.error ?? 'Generation failed');
        generatedScript = genData.script;
        setScript(generatedScript);
        addLog('info', `Script generated (${generatedScript.split('\n').length} lines).`);
      } catch (err) {
        addLog('error', `Generation error: ${err instanceof Error ? err.message : err}`);
        setPhase('failed');
        return;
      }

      // ── Step 2: Execute ──────────────────────────────────────────────────
      setPhase('executing');
      addLog('info', 'Executing script with Playwright…');

      try {
        const execRes = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: generatedScript }),
        });
        const execData = await execRes.json();

        if (execData.success) {
          addLog('success', `✅ Test passed in ${execData.durationMs}ms.`);
          if (execData.output) addLog('info', execData.output);
          setPhase('success');
          return;
        } else {
          addLog('error', `❌ Test failed (attempt ${currentAttempt}/${MAX_RETRIES}).`);
          if (execData.error) addLog('warn', execData.error);
          errorContext = execData.error ?? execData.output;
        }
      } catch (err) {
        addLog('error', `Execution error: ${err instanceof Error ? err.message : err}`);
        errorContext = err instanceof Error ? err.message : String(err);
      }

      // ── Step 3: Retry or give up ─────────────────────────────────────────
      if (currentAttempt < MAX_RETRIES) {
        setPhase('fixing');
        addLog('warn', `Retrying with error context… (attempt ${currentAttempt + 1}/${MAX_RETRIES})`);
        currentAttempt++;
      } else {
        addLog('error', `Gave up after ${MAX_RETRIES} attempts. Check script manually.`);
        setPhase('failed');
        return;
      }
    }
  }, [testCase, url, addLog]);

  const isRunning = ['generating', 'executing', 'fixing'].includes(phase);

  return (
    <div style={styles.root}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⚡ PW Agentic</span>
          <span style={styles.headerSub}>Playwright AI Script Generator</span>
        </div>
        <div style={styles.statusBadge(phase)}>
          {phaseLabel(phase, attempt)}
        </div>
      </header>

      {/* ── Main Layout ─────────────────────────────────────────────────── */}
      <main style={styles.main}>
        {/* Left Panel: Input */}
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Test Case Input</span>
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="url-input">Target URL</label>
            <input
              id="url-input"
              style={styles.input}
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <div style={{ ...styles.field, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label style={styles.label} htmlFor="test-case-input">Test Case (natural language)</label>
            <textarea
              id="test-case-input"
              style={styles.textarea}
              placeholder={`Describe what to test in plain English.\n\nExamples:\n• Verify the page title contains "Example"\n• Click the login button, enter valid credentials, and verify the dashboard loads\n• Fill the contact form and confirm the success message appears`}
              value={testCase}
              onChange={(e) => setTestCase(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <button
            id="run-button"
            style={styles.runButton(isRunning || !testCase.trim() || !url.trim())}
            onClick={handleRun}
            disabled={isRunning || !testCase.trim() || !url.trim()}
          >
            {isRunning ? (
              <><span style={styles.spinner} /> Running…</>
            ) : (
              '▶ Generate & Run'
            )}
          </button>
        </section>

        {/* Right Panel: Script Editor + Console */}
        <section style={{ ...styles.panel, flex: 2 }}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Generated Script</span>
            {phase === 'success' && (
              <span style={{ color: '#22c55e', fontSize: '12px' }}>● Passing</span>
            )}
            {phase === 'failed' && (
              <span style={{ color: '#ef4444', fontSize: '12px' }}>● Needs manual fix</span>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <MonacoEditor
              height="100%"
              language="typescript"
              theme="vs-dark"
              value={script}
              onChange={(val) => setScript(val ?? '')}
              options={{
                fontSize: 13,
                fontFamily: 'Geist Mono, Fira Code, Cascadia Code, monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                padding: { top: 12, bottom: 12 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
              }}
            />
          </div>

          {/* Console */}
          <div style={styles.console}>
            <button
              id="console-toggle"
              style={styles.consoleToggle}
              onClick={() => setConsoleOpen((o) => !o)}
            >
              <span>{consoleOpen ? '▼' : '▶'}</span>
              <span>Console Output</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '11px' }}>
                {logs.length} entries
              </span>
            </button>

            {consoleOpen && (
              <div style={styles.consoleBody}>
                {logs.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>No output yet.</span>
                ) : (
                  logs.map((entry, i) => (
                    <div key={i} style={styles.logEntry(entry.type)}>
                      <span style={styles.logTime}>{entry.time}</span>
                      <span>{entry.message}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── Styles (inline for self-containment) ────────────────────────────────────

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    background: 'var(--bg-primary)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#a09af7',
    letterSpacing: '-0.5px',
  },
  headerSub: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    borderLeft: '1px solid var(--border)',
    paddingLeft: '12px',
  },
  statusBadge: (phase: Phase) => ({
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: phaseColor(phase),
    background: `${phaseColor(phase)}18`,
    border: `1px solid ${phaseColor(phase)}40`,
    borderRadius: '20px',
    padding: '4px 12px',
  }),
  main: {
    display: 'flex',
    flex: 1,
    gap: '1px',
    overflow: 'hidden',
    background: 'var(--border-subtle)',
  },
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    padding: '16px',
    background: 'var(--bg-primary)',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  panelTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    flexShrink: 0,
  },
  label: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  input: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  textarea: {
    flex: 1,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
    resize: 'none' as const,
    outline: 'none',
    lineHeight: 1.6,
    minHeight: '200px',
  },
  runButton: (disabled: boolean) => ({
    padding: '10px 20px',
    background: disabled ? 'var(--bg-card)' : 'var(--accent)',
    color: disabled ? 'var(--text-muted)' : '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.15s',
    flexShrink: 0,
  }),
  spinner: {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  editorPlaceholder: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px',
    background: 'var(--bg-card)',
  },
  console: {
    flexShrink: 0,
    border: '1px solid var(--border)',
    borderRadius: '8px',
    overflow: 'hidden',
    maxHeight: '220px',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  consoleToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'var(--bg-secondary)',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left' as const,
    letterSpacing: '0.5px',
  },
  consoleBody: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 12px',
    background: 'var(--bg-card)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  },
  logEntry: (type: LogEntry['type']) => ({
    display: 'flex',
    gap: '10px',
    color:
      type === 'success' ? '#22c55e' :
      type === 'error' ? '#ef4444' :
      type === 'warn' ? '#f59e0b' :
      'var(--text-secondary)',
    lineHeight: 1.5,
  }),
  logTime: {
    color: 'var(--text-muted)',
    flexShrink: 0,
    userSelect: 'none' as const,
  },
};
