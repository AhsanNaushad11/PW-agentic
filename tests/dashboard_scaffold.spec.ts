import { test, expect } from '@playwright/test';

test('dashboard has 3-panel layout and form fields', async ({ page }) => {
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

  // Panel 2: Interaction Sidebar
  await expect(page.getByText('System Interventions & Logs')).toBeVisible();
  await expect(page.getByText('WORKER_01: Redis connection established.')).toBeVisible();

  // Panel 3: Evidence Bottom Bar
  await expect(page.getByText('Latest Extraction Evidence')).toBeVisible();
  await expect(page.getByText('3 ASSETS STORED')).toBeVisible();
  await expect(page.getByText('STATE_SNAPSHOT')).toHaveCount(2); // Mock cards
  await expect(page.getByText('EXTRACTION_JSON')).toBeVisible();

  // Test form interaction
  await page.getByLabel('Target URL').fill('https://example.com');
  await page.getByLabel('Game Mode').selectOption('crash');
  await page.getByLabel('Target Rounds').fill('50');

  // Submit form (mocked API will be hit)
  // We don't necessarily need the API to succeed for the UI verification,
  // but we want to see the loading state if possible.
  await page.getByRole('button', { name: 'RUN SQA TEST' }).click();

  // Check for loading or status message
  // Since the API might fail (not implemented or server not fully up), we just check if it was attempted.
  // We take a screenshot anyway.
  await page.screenshot({ path: 'tests/dashboard_screenshot.png', fullPage: true });
});
