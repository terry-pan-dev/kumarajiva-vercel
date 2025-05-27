import { test, expect } from '@playwright/test';

test.beforeAll(async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.getByRole('textbox', { name: 'example@gmail.com' }).click();
  await page.getByRole('textbox', { name: 'example@gmail.com' }).fill('e2e-admin@gmail.com');
  await page.getByRole('textbox', { name: '••••••••' }).fill('zykger-3zocpo-wiWhyh');
  await page.getByRole('button', { name: 'Login →' }).click();
});

test('create new glossary', async ({ page }) => {
  await page.getByRole('link', { name: 'Glossary' }).click();
  await page.getByRole('button', { name: 'New' }).click();
  await page.locator('#glossaryChinese').fill('中文測試');
  await page.locator('#phoneticChinese').fill('zhong wen ce shi');
  await page.locator('#glossary').fill('zhong wen ce shi');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('textbox', { name: 'Glossary Term' }).fill('中文測試');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.mb-2 > .rounded-lg > .flex')).toBeVisible();
  await page.locator('.relative > div > div > div').first().click();
  await expect(page.locator('h3')).toContainText('中文測試');
  await page.locator('h2').filter({ hasText: '中文測試' }).click();
  await expect(page.getByRole('main')).toContainText('中文測試');
  await expect(page.getByRole('main')).toContainText('(zhong wen ce shi)');
});
