import { test, expect } from '@playwright/test';

test('dashboard has 3-panel layout and properly isolates network state', async ({ page }) => {
  // 1. STRICT NETWORK INTERCEPTION (Isolate Tier 1 from Tier 2)
  await page.route('**/api/jobs/execute', async (route) => {
    // Inject a 500ms delay to give us time to verify the "DISPATCHING..." UI state
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, jobId: 'mock-test-id-123' }),
    });
  });

  await page.goto('http://localhost:3000');

  // Verify Header
  await expect(page.getByText('SQA HARNESS | CONTROL PLANE')).toBeVisible();

  // Panel 1: Main Control
  await expect(page.getByRole('heading', { name: 'Main Control' })).toBeVisible();
  await expect(page.getByLabel('Target URL')).toBeVisible();
  await expect(page.getByLabel('Game Mode')).toBeVisible();
  await expect(page.getByLabel('Target Rounds')).toBeVisible();
  await expect(page.getByLabel('Spin Interval (ms)')).toBeVisible();
  await expect(page.getByLabel('Max Memory (MB)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'RUN SQA TEST' })).toBeVisible();

  // Panel 2 & 3: Layout Verification
  await expect(page.getByText('System Interventions & Logs')).toBeVisible();
  await expect(page.getByText('Latest Extraction Evidence')).toBeVisible();

  // Test form interaction
  await page.getByLabel('Target URL').fill('https://example.com/slots');
  await page.getByLabel('Game Mode').selectOption('crash');
  await page.getByLabel('Target Rounds').fill('50');

  // 2. STATE VERIFICATION
  await page.getByRole('button', { name: 'RUN SQA TEST' }).click();

  // Instantly check for the loading state (our 500ms network delay makes this possible)
  await expect(page.getByRole('button', { name: /DISPATCHING/i })).toBeVisible();

  // Wait for the mocked network response to resolve and check for the success message
  await expect(page.getByText('Job dispatched successfully.')).toBeVisible();

  // Verify the button resets correctly
  await expect(page.getByRole('button', { name: 'RUN SQA TEST' })).toBeVisible();

  // Capture final evidence
  await page.screenshot({ path: 'tests/dashboard_screenshot.png', fullPage: true });
});
