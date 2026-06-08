import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

/**
 * Write a script to a temp file, execute it with Playwright, clean up, return result.
 */
export async function executeScript(script: string): Promise<ExecutionResult> {
  // Cross-platform temp dir (works on Linux and Windows)
  const tempDir = path.join(tmpdir(), 'pw-ai-runner');
  await mkdir(tempDir, { recursive: true });

  const fileName = `test-${randomUUID()}.spec.ts`;
  const filePath = path.join(tempDir, fileName);

  const start = Date.now();

  try {
    await writeFile(filePath, script, 'utf-8');

    // playwright.config is not needed — use inline config via env/cli flags
    // --reporter=json for structured output, fall back to line reporter for humans
    const { stdout, stderr } = await execAsync(
      `npx playwright test "${filePath}" --reporter=list`,
      {
        timeout: 60_000, // 60s max per run
        env: {
          ...process.env,
          // Ensure Playwright uses the project's local install
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '0',
        },
      }
    );

    const durationMs = Date.now() - start;
    const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim();

    return {
      success: true,
      output: combinedOutput || '✅ Test passed with no output.',
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const error = err as { stdout?: string; stderr?: string; message?: string };

    const rawOutput = [error.stdout, error.stderr, error.message]
      .filter(Boolean)
      .join('\n')
      .trim();

    return {
      success: false,
      output: rawOutput,
      error: rawOutput,
      durationMs,
    };
  } finally {
    // Best-effort cleanup — don't throw if file is already gone
    await unlink(filePath).catch(() => {});
  }
}
