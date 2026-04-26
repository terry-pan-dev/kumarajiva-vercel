import { expect, test } from '@playwright/test';

test('site is live and dashboard is accessible', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByLabel('Logo').locator('span')).toContainText('Kumarajiva');
});

test('sidebar navigation icons are rendered', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: /Translation/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Glossary/i })).toBeVisible();
});
