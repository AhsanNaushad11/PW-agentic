import { create } from 'zustand';

interface LogEntry {
  time: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

interface WorkerState {
  status: 'idle' | 'running' | 'paused' | 'failed' | 'success';
  memoryUsageMb: number;
  lastPing: number;
}

interface UiState {
  wsConnected: boolean;
  logs: LogEntry[];
  workerState: WorkerState;
  activeJobId: string | null;
  addLog: (type: LogEntry['type'], message: string) => void;
  setWsConnected: (status: boolean) => void;
  updateWorkerState: (state: Partial<WorkerState>) => void;
  setActiveJobId: (jobId: string | null) => void;
  clearLogs: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  wsConnected: false,
  logs: [],
  workerState: {
    status: 'idle',
    memoryUsageMb: 0,
    lastPing: Date.now(),
  },
  activeJobId: null,

  addLog: (type, message) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          type,
          message,
        },
      ],
    })),

  setWsConnected: (status) => set({ wsConnected: status }),

  updateWorkerState: (newState) =>
    set((state) => ({
      workerState: { ...state.workerState, ...newState },
    })),

  setActiveJobId: (jobId) => set({ activeJobId: jobId }),

  clearLogs: () => set({ logs: [] }),
}));
