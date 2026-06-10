import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface OcrResult {
  isWin: boolean;
  detectedBalance: number;
  detectedWinAmount: number;
}

export async function parseTerminalState(screenshotBase64: string): Promise<OcrResult | null> {
  try {
    const prompt = `
      Analyze this casino game screenshot (the terminal state after a spin).
      Extract the following information using the provided JSON schema:
      - isWin: true if the player won this round, false otherwise.
      - detectedBalance: the current numerical balance shown on screen.
      - detectedWinAmount: the amount won in this round (0 if no win).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: screenshotBase64,
              }
            }
          ]
        }
      ],
      config: {
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          }
        ],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isWin: { type: Type.BOOLEAN },
            detectedBalance: { type: Type.NUMBER },
            detectedWinAmount: { type: Type.NUMBER },
          },
          required: ['isWin', 'detectedBalance', 'detectedWinAmount'],
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as OcrResult;
    }
    return null;
  } catch (err) {
    console.error('OCR Error:', err);
    return null;
  }
}
