import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { broadcastLog, broadcastScreenshot } from '../index';

export class PlaywrightEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private deadManSwitchTimeout: NodeJS.Timeout | null = null;

  async init(headless: boolean = true) {
    broadcastLog('info', `Initializing Playwright (headless: ${headless})`);
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async navigate(url: string) {
    if (!this.page) throw new Error('Page not initialized');
    broadcastLog('info', `Navigating to ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  async captureScreenshot(): Promise<Buffer> {
    if (!this.page) throw new Error('Page not initialized');
    const buffer = await this.page.screenshot({ type: 'jpeg', quality: 80 });
    broadcastScreenshot(buffer.toString('base64'));
    return buffer;
  }

  async clickAt(x: number, y: number) {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.mouse.click(x, y);
  }

  async fallbackClick() {
    if (!this.page) throw new Error('Page not initialized');
    broadcastLog('warn', 'Vision failed to find target. Using Spacebar fallback.');
    await this.page.keyboard.press('Space');
  }

  triggerHardHalt(reason: string) {
    broadcastLog('error', `HARD HALT: ${reason}. Switching to manual intervention mode.`);
    // In a real scenario, switching a running context from headless to headful is not natively supported by Playwright 
    // without relaunching the browser. For architectural adherence, we notify the user and start the Dead Man's Switch.
    
    this.startDeadManSwitch();
  }

  private startDeadManSwitch() {
    if (this.deadManSwitchTimeout) clearTimeout(this.deadManSwitchTimeout);
    
    broadcastLog('warn', 'Dead Man Switch activated. Human intervention required within 3 minutes.');
    
    this.deadManSwitchTimeout = setTimeout(async () => {
      broadcastLog('error', 'Dead Man Switch expired. No human intervention detected. Aborting execution.');
      await this.cleanup();
      process.exit(1);
    }, 3 * 60 * 1000); // 3 minutes
  }

  async cleanup() {
    if (this.deadManSwitchTimeout) clearTimeout(this.deadManSwitchTimeout);
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
  }
}
