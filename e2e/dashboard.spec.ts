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

test('body background reflects CSS variable in light mode', async ({ page }) => {
  await page.goto('/dashboard');
  const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bgColor).toBe('rgb(255, 255, 255)');
});

test('dark variant changes background when .dark class is applied to html', async ({ page }) => {
  await page.goto('/dashboard');
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).not.toBe(lightBg);
});
