import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

const MODEL = process.env.LLM_MODEL ?? 'gemini-2.5-flash';
// Ensure you have GEMINI_API_KEY set in your .env.local
const ai = new GoogleGenAI({});

const SYSTEM_PROMPT = `You are an expert Playwright test automation engineer.

RULES — follow them exactly, no exceptions:
1. Output ONLY valid TypeScript code. No markdown fences, no prose, no explanation.
2. The script must be a standalone Playwright test file using @playwright/test.
3. Always import from '@playwright/test': import { test, expect } from '@playwright/test';
4. Use the exact URL provided by the user in page.goto().
5. Use clear, descriptive test/step names.
6. Prefer waitForSelector or getByRole/getByText locators over raw CSS selectors.
7. Add expect() assertions that actually verify the expected state.
8. The file must be self-contained — no external helpers, no relative imports.
9. Do NOT wrap output in triple backticks or any markdown.`;

function buildPrompt(
  testCase: string,
  url: string,
  errorContext?: string
): string {
  const userContent = errorContext
    ? `Fix the following Playwright script that failed. 

ORIGINAL TEST CASE:
${testCase}

TARGET URL: ${url}

PREVIOUS SCRIPT (FAILED):
The script produced this error:
${errorContext}

Generate a corrected version of the script. Output ONLY the fixed TypeScript code.`
    : `Generate a Playwright test script for the following test case.

TEST CASE:
${testCase}

TARGET URL: ${url}

Output ONLY the TypeScript code.`;

  return userContent;
}

export async function generateScript(
  testCase: string,
  url: string,
  errorContext?: string
): Promise<string> {
  const prompt = buildPrompt(testCase, url, errorContext);

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.2, // Low temperature for code generation
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
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
      ],
    }
  });

  let script = response.text?.trim() || '';

  // Strip any accidental markdown fences the model might still emit
  script = script
    .replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  return script;
}
