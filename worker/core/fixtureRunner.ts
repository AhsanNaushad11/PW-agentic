import { PlaywrightEngine } from './playwrightEngine';
import { parseTerminalState } from '../vision/ocr';
import { broadcastLog } from '../index';

interface JobData {
  jobId: string;
  targetUrl: string;
  mode: string;
  config: {
    totalRounds: number;
    lowBalanceHaltThreshold: number;
    timing: {
      roundIntervalMs: number;
      visibilityWindowMs: number;
    }
  };
}

export async function executeJob(data: JobData) {
  const engine = new PlaywrightEngine();
  
  try {
    broadcastLog('info', `Starting fixture execution for ${data.jobId} (Mode: ${data.mode})`);
    
    // 1. Init browser
    await engine.init(true); // Headless mode by default
    
    // 2. Navigate
    await engine.navigate(data.targetUrl);
    
    let roundsCompleted = 0;
    
    while (roundsCompleted < data.config.totalRounds) {
      broadcastLog('info', `--- Round ${roundsCompleted + 1} / ${data.config.totalRounds} ---`);
      
      // Step A: Trigger a spin (Simulate finding the spin button using fallback since we don't have real templates)
      await engine.fallbackClick();
      
      // Step B: Wait for the mandatory spin interval + visibility window
      broadcastLog('info', `Waiting for spin resolution (${data.config.timing.roundIntervalMs}ms)`);
      await new Promise(res => setTimeout(res, data.config.timing.roundIntervalMs));
      
      // Step C: Capture terminal state within the 2.5s visibility window
      broadcastLog('info', 'Capturing terminal state for OCR analysis...');
      const screenshotBuffer = await engine.captureScreenshot();
      const base64Image = screenshotBuffer.toString('base64');
      
      // Step D: Send to Gemini for OCR
      const ocrResult = await parseTerminalState(base64Image);
      
      if (!ocrResult) {
        broadcastLog('warn', 'Failed to parse OCR result. Assuming loss and continuing.');
      } else {
        broadcastLog('success', `OCR Result: Win=${ocrResult.isWin}, Balance=${ocrResult.detectedBalance}, WinAmount=${ocrResult.detectedWinAmount}`);
        
        // Soft Assertion Logic (Mocked logic checking against fixture)
        // In a real run, we'd load fixture math. Here we just log.
        if (ocrResult.isWin && ocrResult.detectedWinAmount === 0) {
          broadcastLog('warn', 'Soft Assertion Failed: isWin=true but detectedWinAmount=0');
        }
        
        // Hard Halt Check
        if (ocrResult.detectedBalance < data.config.lowBalanceHaltThreshold) {
          engine.triggerHardHalt(`Balance (${ocrResult.detectedBalance}) dropped below threshold (${data.config.lowBalanceHaltThreshold})`);
          // Stop executing automatically; wait for Dead Man's Switch
          return;
        }
      }
      
      roundsCompleted++;
    }
    
    broadcastLog('success', `Job ${data.jobId} finished all ${data.config.totalRounds} rounds successfully.`);
  } catch (err: any) {
    broadcastLog('error', `Execution failed: ${err.message}`);
    throw err;
  } finally {
    // Cleanup will close the browser unless the Dead Man switch took over
    await engine.cleanup();
  }
}
