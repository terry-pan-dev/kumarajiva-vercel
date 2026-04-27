import { expect, test } from '@playwright/test';

// Login form: run without stored auth so we actually see the login page
test.describe('Login form validation', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows error for password shorter than 8 characters', async ({ page }) => {
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Login →' }).click();
    await expect(page.locator('p.text-red-500')).toContainText('at least 8 character');
  });

  test('shows errors for both fields when submitted empty', async ({ page }) => {
    await page.getByRole('button', { name: 'Login →' }).click();
    await expect(page.locator('p.text-red-500')).toHaveCount(2);
  });
});

// Glossary new-entry form
test.describe('Glossary form validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Glossary' }).click();
    await page.getByRole('button', { name: 'New' }).click();
  });

  test('shows error when Chinese field contains non-Chinese characters', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Glossary Chinese' }).fill('not chinese');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('p.text-red-500').first()).toContainText('Glossary only accept chinese');
  });

  test('shows error when required fields are empty', async ({ page }) => {
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('p.text-red-500').first()).toContainText('Glossary must be at least 1 characters');
  });
});

// Admin forms — requires the test user to have admin role
test.describe('Admin form validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Admin' }).click();
    await page.getByRole('button', { name: 'Expand actions' }).click();
  });

  test('Create Team: shows errors for empty name and alias', async ({ page }) => {
    // sr-only span sibling identifies each icon button
    await page.locator('span.sr-only').filter({ hasText: 'Add Team' }).locator('..').getByRole('button').click();
    await expect(page.getByRole('dialog')).toContainText('Create New Team');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('p.text-red-500').first()).toBeVisible();
  });
});
