import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/translation');
  await page.locator('article').first().click();
  const rollLink = page.locator('a[href^="/translation/"]').first();
  await expect(rollLink).toBeVisible();
  await rollLink.click();
  await expect(page).toHaveURL(/\/translation\/[^/]+$/);
});

test('paragraph rows are visible (framer-motion)', async ({ page }) => {
  await expect(page.getByRole('radio').first()).toBeVisible();
});

test('AI translation card appears when a paragraph is selected', async ({ page }) => {
  await page.getByRole('radio').first().click();
  await expect(page.getByText('AI Translation')).toBeVisible();
});

test('copy icon (lucide-react) is present in the workspace', async ({ page }) => {
  await page.getByRole('radio').first().click();
  await expect(page.getByText('AI Translation')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('svg.lucide-copy')).toBeAttached();
});

test('split panel renders after paragraph selection (react-resizable-panels)', async ({ page }) => {
  await page.getByRole('radio').first().click();
  // DragPanel (ResizablePanelGroup) only mounts once a paragraph is selected
  await expect(page.locator('[data-group]')).toBeVisible({ timeout: 10000 });
});

test('resize handle is attached and survives a drag (react-resizable-panels)', async ({ page }) => {
  await page.getByRole('radio').first().click();
  // PanelResizeHandle renders with data-separator in v4
  const handle = page.locator('[data-separator]').first();
  await expect(handle).toBeAttached({ timeout: 10000 });

  const box = await handle.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
    await page.mouse.up();
  }
  await expect(page.locator('[data-group]')).toBeVisible();
});
