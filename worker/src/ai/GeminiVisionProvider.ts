import { GoogleGenerativeAI, Part, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { GeminiOcrExtraction } from '../types/vision.types'; 

// Ensure environment variables are loaded
dotenv.config();

export class GeminiVisionProvider {
  /**
   * Analyzes a game frame and extracts financial metrics via Gemini 1.5 Pro.
   * @param screenshotPath - Absolute path to the frame saved on disk.
   */
  public static async analyzeFrame(screenshotPath: string): Promise<GeminiOcrExtraction> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('[GeminiVisionProvider] GEMINI_API_KEY is not defined in the environment.');
    }

    let imageBuffer: Buffer;
    try {
      // Use fs.promises.access instead of synchronous fs.existsSync, then read.
      await fs.promises.access(screenshotPath, fs.constants.R_OK);
      imageBuffer = await fs.promises.readFile(screenshotPath);
    } catch (fsError) {
      // FLAW FIX: Catch file lock/permission errors gracefully
      throw new Error(`[GeminiVisionProvider] Failed to read screenshot at path: ${screenshotPath}. Error: ${fsError}`);
    }

    // 1. Initialize the GoogleGenerativeAI client
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 2. Select the gemini-1.5-pro model and configure safety settings
    // FLAW FIX: Casino/gambling games frequently trigger false-positive safety 
    // filters in LLMs. We MUST override the default thresholds to BLOCK_NONE.
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-pro',
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        }
      ]
    });

    // 3. Convert to base64 and package as inline data part
    const base64Image = imageBuffer.toString('base64');
    const imagePart: Part = {
      inlineData: {
        data: base64Image,
        mimeType: 'image/png',
      },
    };

    // 4. Enforce strict system instructions and expected schema
    const prompt = `You are an automated OCR data extraction node for a casino game SQA harness. Extract the financial data. Return ONLY valid JSON. The JSON must strictly adhere to the following interface structure:
{
  "currentBalance": number,
  "betAmount": number,
  "winAmount": number,
  "visibilityMetrics": {
    "canvasVisibilityConfirmed": boolean,
    "confidenceScore": number (0.0 to 1.0)
  },
  "anomalyDetected": boolean,
  "anomalyReason": string | null
}`;

    let result;
    try {
      // 5. Execute the call with application/json configuration
      result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
    } catch (apiError) {
      // FLAW FIX: Handle network drops, rate limits (429), or API outages gracefully
      console.error(`[GeminiVisionProvider] API call failed:`, apiError);
      throw new Error(`[GeminiVisionProvider] Failed to connect to Gemini API: ${apiError}`);
    }

    let responseText: string;
    try {
      // FLAW FIX: .text() will throw an exception if the response was blocked by safety 
      // filters, even if we attempted to override them.
      responseText = result.response.text();
    } catch (safetyError) {
      console.error(`[GeminiVisionProvider] Response blocked or empty. Candidates:`, JSON.stringify(result.response.candidates, null, 2));
      throw new Error(`[GeminiVisionProvider] Gemini refused to answer, likely due to safety filters: ${safetyError}`);
    }
    
    try {
      const extraction: GeminiOcrExtraction = JSON.parse(responseText);
      return extraction;
    } catch (parseError) {
      console.error(`[GeminiVisionProvider] Failed to parse Gemini response as JSON.\nRaw Response: ${responseText}`);
      throw new Error(`[GeminiVisionProvider] JSON parsing error: ${parseError}`);
    } finally {
      // CLEANUP: Defensive Memory Management
      // In high-throughput Node.js workers, passing around massive base64 strings
      // and Buffers can cause GC pressure spikes. While Node automatically frees
      // these when the function scope closes, explicitly nulling them ensures 
      // V8 can reap them immediately if the worker gets stuck on other async tasks.
      imageBuffer = null as any;
    }
  }
}

// =============================================================================
// SPECULATED ISSUES & KNOWN LIMITATIONS — FOR THE RECORD
// =============================================================================
//
// 1. LATENCY BOTTLENECK (GEMINI 1.5 PRO)
//    Upgrading to `gemini-1.5-pro` drastically improves reasoning and OCR accuracy
//    but incurs a significant latency penalty compared to `flash` (often 5s - 15s 
//    per frame). This completely breaks real-time capability and will drastically
//    slow down the worker loop.
//
// 2. HALLUCINATIONS ON RAPIDLY CHANGING CANVAS
//    If the screenshot is captured mid-spin (blur, flashing numbers, particle 
//    effects), Gemini may hallucinate numbers or default to null. The prompt 
//    does not currently instruct Gemini on how to handle "spinning" states vs 
//    "settled" states.
//
// 3. RATE LIMITING (HTTP 429)
//    If we run multiple BullMQ workers simultaneously, we will quickly hit
//    the Google Generative AI quotas (RPM/TPM limits). There is no backoff
//    strategy or retry logic implemented here—it just throws and fails the job.
//
// 4. JSON SCHEMA ENFORCEMENT
//    While `responseMimeType: "application/json"` forces JSON syntax, the model 
//    can theoretically still deviate from the exact interface keys. There is no
//    Zod/Joi runtime validation asserting that `extraction.currentBalance` 
//    is actually a number before returning it to the worker.
//
// =============================================================================
