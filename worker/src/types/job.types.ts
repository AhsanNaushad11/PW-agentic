// worker/src/types/job.types.ts

export type GameMode = 'slot' | 'crash' | 'plinko';

export interface SqaJobPayload {
    jobId: string;
    targetUrl: string;
    gameMode: GameMode;

    // The SRS Mandatory Guardrails
    executionParameters: {
        targetRounds: number;           // e.g., 100
        spinIntervalMs: number;         // MUST be >= 5000
        maxMemoryThresholdMb: number;   // Hards halts if > 1500
    };

    // For the Lobby & Authentication Pipeline
    sessionContext?: {
        authToken?: string;
        userAgentOverride?: string;
    };
}