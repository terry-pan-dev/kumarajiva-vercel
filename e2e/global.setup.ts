import { test as setup, expect } from '@playwright/test';

setup('login', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email Address').fill(process.env.E2E_ADMIN_NAME || '');
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWD || '');
  await page.getByRole('button', { name: 'Login →' }).click();
  await page.waitForURL('/dashboard', { timeout: 10000 });
  await page.context().storageState({ path: '.auth/storageState.json' });
  console.log('Global setup complete - storage state saved');
  await expect(page.getByLabel('Logo').locator('span')).toContainText('Kumarajiva');
});
