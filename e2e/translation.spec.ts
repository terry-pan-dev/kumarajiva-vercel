import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/translation');
});

test('sutra rows are visible and expand on click', async ({ page }) => {
  const sutras = page.locator('h3');
  await expect(sutras.first()).toBeVisible();
  await sutras.first().click();
  await expect(page.locator('a[href^="/translation/"]').first()).toBeVisible();
});

test('clicking a sutra then a roll navigates to the roll page', async ({ page }) => {
  await page.locator('h3').first().click();
  const firstRollLink = page.locator('a[href^="/translation/"]').first();
  await expect(firstRollLink).toBeVisible();
  const rollHref = await firstRollLink.getAttribute('href');
  await firstRollLink.click();
  await expect(page).toHaveURL(/\/translation\/[^/]+$/);
  expect(page.url()).toContain(rollHref);
});
