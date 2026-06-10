import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { SqaJobPayload } from '../types/job.types';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  public page: Page | null = null;

  /**
   * 1. Initialization
   * Launches a visible Chromium instance and creates a new browsing context and page.
   */
  public async initialize(userAgent?: string): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
    
    // Fix: Inject userAgent if provided, otherwise default to a non-bot string
    this.context = await this.browser.newContext({
      userAgent: userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    this.page = await this.context.newPage();

    // Fix: Dialog Handler (Kills freezes before they happen)
    this.page.on('dialog', async (dialog) => {
      console.warn(`[BrowserManager] Dialog detected and dismissed: ${dialog.message()}`);
      await dialog.dismiss();
    });
  }
  
  /**
   * 2. Navigation
   * Navigates the initialized page to the payload's target URL.
   */
  public async loadGame(payload: SqaJobPayload): Promise<void> {
    if (!this.page || !this.context) {
      throw new Error('BrowserManager not initialized.');
    }

    if (payload.sessionContext?.authToken) {
      await this.context.setExtraHTTPHeaders({
        'Authorization': `Bearer ${payload.sessionContext.authToken}`
      });
    }

    console.log(`[BrowserManager] Navigating to ${payload.targetUrl}...`);
    
    // Fix: networkidle is mandatory for WebGL games
    await this.page.goto(payload.targetUrl, {
      waitUntil: 'networkidle',
      timeout: 60000 // 60s timeout for heavy canvas assets
    });
  }

  /**
   * 3. Memory Guardrail (From SRS constraints)
   * Evaluates the current Node process memory and halts if it exceeds the limit.
   */
  public async checkMemoryThreshold(limitMb: number): Promise<void> {
    const memoryUsage = process.memoryUsage();
    // Resident Set Size (RSS) is the total memory allocated for the process execution
    const rssMb = memoryUsage.rss / 1024 / 1024;
    
    if (rssMb > limitMb) {
      // Prevent browser orphaning by tearing down before throwing
      console.error(`[BrowserManager] Memory threshold breached — initiating emergency teardown...`);
      await this.close();
      throw new Error(`[FATAL] Memory threshold exceeded! Current RSS: ${rssMb.toFixed(2)} MB, Limit: ${limitMb} MB`);
    }
    
    console.log(`[BrowserManager] Memory Check - RSS: ${rssMb.toFixed(2)} MB / Limit: ${limitMb} MB`);
  }

  /**
   * 4. Teardown
   * Cleanly terminates the page, context, and browser instance to prevent memory leaks.
   */
  public async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
      }
    } catch (e) {
      console.error(`[BrowserManager] Error closing page:`, e);
    } finally {
      this.page = null;
    }

    try {
      if (this.context) {
        await this.context.close();
      }
    } catch (e) {
      console.error(`[BrowserManager] Error closing context:`, e);
    } finally {
      this.context = null;
    }

    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch (e) {
      console.error(`[BrowserManager] Error closing browser:`, e);
    } finally {
      this.browser = null;
    }
  }
}
