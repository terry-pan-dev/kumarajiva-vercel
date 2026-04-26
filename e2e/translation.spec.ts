import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/translation');
});

test('sutra cards are visible and animate in', async ({ page }) => {
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  // Clicking a card triggers AnimatePresence roll-list slide-in (framer-motion)
  await cards.first().click();
  await expect(page.locator('a[href^="/translation/"]').first()).toBeVisible();
});

test('clicking a sutra then a roll navigates to the roll page', async ({ page }) => {
  await page.locator('article').first().click();
  const firstRollLink = page.locator('a[href^="/translation/"]').first();
  await expect(firstRollLink).toBeVisible();
  const rollHref = await firstRollLink.getAttribute('href');
  await firstRollLink.click();
  await expect(page).toHaveURL(/\/translation\/[^/]+$/);
  expect(page.url()).toContain(rollHref);
});
