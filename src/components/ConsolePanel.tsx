'use client';

import React, { useEffect, useRef } from 'react';
import { useConsoleStore } from '@/store/useConsoleStore';

/**
 * ConsolePanel Component
 *
 * A polished, responsive execution console that mimics a VS Code terminal.
 * Displays real-time logs from the Zustand store with auto-scroll and color-coding.
 */
export const ConsolePanel: React.FC = () => {
  const { logs, clearLogs } = useConsoleStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever logs change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  /**
   * Helper to determine text color based on log level.
   */
  const getLogColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      case 'success':
        return 'text-green-400';
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div className="w-full bg-gray-950 border border-gray-800 rounded-t-xl shadow-2xl flex flex-col h-48 md:h-64 lg:h-80 overflow-hidden transition-all duration-300">
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-sm border-b border-gray-800 px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
          </div>
          <h2 className="text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider ml-2">
            Execution Console
          </h2>
        </div>
        <button
          onClick={clearLogs}
          className="px-3 py-1 bg-gray-800 text-gray-300 text-xs md:text-sm rounded-md hover:bg-gray-700 hover:text-white transition-all duration-200 active:scale-95"
        >
          Clear
        </button>
      </header>

      {/* Log Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 md:p-4 font-mono text-xs md:text-sm scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent selection:bg-indigo-500/30"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 italic">
            No execution logs yet.
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-gray-600 shrink-0 select-none">
                  [{log.timestamp}]
                </span>
                <span className={`${getLogColor(log.level)} break-all`}>
                  <span className="font-bold uppercase mr-2">{log.level}:</span>
                  {log.message}
                </span>
              </div>
            ))}
            {/* Invisible div for scroll anchoring */}
            <div className="h-2" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsolePanel;
