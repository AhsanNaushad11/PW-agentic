import { create } from 'zustand';

/**
 * Supported log levels for the Execution Console.
 */
export type LogLevel = 'info' | 'error' | 'warning' | 'success';

/**
 * Interface for a single log entry.
 */
export interface Log {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

/**
 * Zustand store state and actions for the Execution Console.
 */
interface ConsoleState {
  /** Array of log entries. */
  logs: Log[];
  /**
   * Appends a new log entry to the console.
   * Automatically generates id and timestamp.
   */
  addLog: (level: LogLevel, message: string) => void;
  /** Resets the logs array to empty. */
  clearLogs: () => void;
}

/**
 * Store for managing real-time runtime logs, findings, and execution errors.
 */
export const useConsoleStore = create<ConsoleState>((set) => ({
  logs: [],

  addLog: (level, message) => {
    const newLog: Log = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level,
      message,
    };

    set((state) => ({
      logs: [...state.logs, newLog],
    }));
  },

  clearLogs: () => set({ logs: [] }),
}));
