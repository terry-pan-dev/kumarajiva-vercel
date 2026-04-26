import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
});

test('avatar editor canvas appears after uploading an image (react-avatar-editor)', async ({ page }) => {
  // Avatar editor lives inside the "User Settings" tab (not the default tab)
  await page.getByRole('tab', { name: 'User Settings' }).click();

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached();

  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  await fileInput.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer });
  await expect(page.locator('canvas')).toBeVisible();
});
