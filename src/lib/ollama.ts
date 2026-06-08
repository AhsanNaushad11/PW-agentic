import ollama from 'ollama';

const MODEL = process.env.OLLAMA_MODEL ?? 'kimi-k2:cloud';
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

const client = new ollama.Ollama({ host: OLLAMA_HOST });

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

function buildMessages(
  testCase: string,
  url: string,
  errorContext?: string
): ollama.Message[] {
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

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

export async function generateScript(
  testCase: string,
  url: string,
  errorContext?: string
): Promise<string> {
  const messages = buildMessages(testCase, url, errorContext);

  const response = await client.chat({
    model: MODEL,
    messages,
    stream: false,
  });

  let script = response.message.content.trim();

  // Strip any accidental markdown fences the model might still emit
  script = script
    .replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  return script;
}
