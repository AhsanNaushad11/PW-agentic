// worker/src/types/vision.types.ts

export interface GeminiOcrExtraction {
    // Strict math extraction
    currentBalance: number;
    betAmount: number;
    winAmount: number;

    // The SRS Vision Guardrails
    visibilityMetrics: {
        canvasVisibilityConfirmed: boolean; // Did it see the 2.5s-3s window?
        confidenceScore: number;            // 0.0 to 1.0 (Fail if < 0.85)
    };

    // Halts the worker if the AI detects an error state on screen
    anomalyDetected: boolean;
    anomalyReason: string | null;         // e.g., "Insufficient Balance flag visible"
}