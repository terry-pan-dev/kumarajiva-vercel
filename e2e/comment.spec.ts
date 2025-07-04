import { test, expect } from '@playwright/test';

/**
 * @test Comment System E2E Tests
 *
 * @scenario User Story:
 * As an admin user of the Kumarajiva translation platform,
 * I want to navigate through the translation content,
 * view comment threads related to specific text segments,
 * and resolve discussions to maintain a clean workspace.
 *
 * This test suite validates the complete comment workflow:
 * - Navigation to translation content
 * - Accessing specific Buddhist text chapters
 * - Interacting with comment notifications and threads
 * - Resolving comment discussions
 * - Verifying UI state changes after resolution
 *
 * The tests ensure that collaborative translation features
 * work correctly for team-based translation projects.
 */

test.beforeEach(async ({ page }) => {
  // Navigate to the translation section from dashboard
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Translation' }).click();
});

/**
 * Task: Test complete comment system workflow
 *
 * Arrange & Act:
 * 1. Navigate to Translation section from dashboard
 * 2. Click on the first article "大方廣佛華嚴經" (Avatamsaka Sutra)
 * 3. Click on the first chapter "世界妙嚴品之一" to enter translation workspace
 * 4. Locate and click the comment button with notification number "2"
 * 5. Verify comment thread dialog opens with correct content
 * 6. Check that existing messages are visible in the thread
 * 7. Mark the comment thread as resolved using the toggle switch
 *
 * Assert:
 * 1. Comment thread dialog opens when notification button is clicked
 * 2. Dialog displays the correct thread title "Comment Thread"
 * 3. Existing messages from "TL (Test Leader)" and "TP (Terry Pan)" are visible
 * 4. Message content "new message" and "sure" are displayed correctly
 * 5. Comment thread dialog closes when marked as resolved
 * 6. Notification number "2" disappears from the text segment
 * 7. Translation workspace returns to clean state without active notifications
 */
test('view and resolve comment thread with notifications', async ({ page }) => {
  // Step 1: Navigate to the first article - Avatamsaka Sutra
  await page.getByRole('article').filter({ hasText: '大方廣佛華嚴經實叉難陀華嚴部類' }).click();

  // Step 2: Click on the first chapter to enter translation workspace
  await page.getByRole('link').filter({ hasText: '世界妙嚴品之一大方廣佛華嚴經卷一' }).click();

  // Wait for translation page to load
  await expect(page).toHaveURL(/.*\/translation\/.*$/);
  await expect(page.getByText('大方廣佛華嚴經')).toBeVisible();
  await expect(page.getByText('世界妙嚴品之一')).toBeVisible();

  // Step 3: Locate the comment button with notification number "2"
  const commentButton = page.getByRole('button', { name: 'TL' });
  await expect(commentButton).toBeVisible();
  await expect(page.getByText('2')).toBeVisible(); // Notification count

  // Step 4: Click the comment button to open the thread
  await commentButton.click();

  // Step 5: Verify comment thread dialog opens
  const commentDialog = page.getByRole('dialog', { name: 'Comment Thread' });
  await expect(commentDialog).toBeVisible();

  // Step 6: Verify the referenced text is highlighted in the dialog
  await expect(commentDialog.getByText('复以摩尼而为其果，含晖发焰，与华间列')).toBeVisible();
  await expect(commentDialog.locator('code')).toContainText('广博严丽充遍十方');

  // Step 7: Verify existing messages in the thread
  // Check first message from Test Leader
  await expect(commentDialog.getByText('TL')).toBeVisible();
  await expect(commentDialog.getByText('Test Leader • 16/05/2025, 16:40:02')).toBeVisible();
  await expect(commentDialog.getByText('new message')).toBeVisible();

  // Check second message from Terry Pan
  await expect(commentDialog.getByText('TP')).toBeVisible();
  await expect(commentDialog.getByText('Terry Pan • 16/05/2025, 16:41:03')).toBeVisible();
  await expect(commentDialog.getByText('sure')).toBeVisible();

  // Step 8: Verify UI elements in the comment dialog
  await expect(
    commentDialog.getByRole('textbox', { name: 'Type your message... (Press Enter to send)' }),
  ).toBeVisible();
  await expect(commentDialog.getByRole('switch', { name: 'Mark as resolved' })).toBeVisible();
  await expect(commentDialog.getByRole('button', { name: 'Close' })).toBeVisible();

  // Step 9: Mark the comment thread as resolved
  await commentDialog.getByRole('switch', { name: 'Mark as resolved' }).click();

  // Step 10: Verify comment dialog closes automatically
  await expect(commentDialog).not.toBeVisible();

  // Step 11: Verify notification indicator disappears
  // The TL button should no longer show the notification number
  await expect(page.getByText('2')).not.toBeVisible();

  // Step 12: Verify translation workspace is back to normal state
  await expect(page.getByText('大方廣佛華嚴經')).toBeVisible();
  await expect(page.getByText('世界妙嚴品之一')).toBeVisible();

  // Verify that the translation content is still accessible
  await expect(page.getByText('如是我闻：一时，佛在摩竭提国阿兰若法菩提场中')).toBeVisible();
  await expect(page.getByText('Thus have I heard: Once, the Buddha was in the land of Magadha')).toBeVisible();
});

/**
 * Task: Test comment thread visibility and accessibility
 *
 * This test ensures that comment threads are properly displayed
 * and contain the expected content structure.
 */
test('verify comment thread content structure', async ({ page }) => {
  // Navigate to translation workspace
  await page.getByRole('article').filter({ hasText: '大方廣佛華嚴經實叉難陀華嚴部類' }).click();
  await page.getByRole('link').filter({ hasText: '世界妙嚴品之一大方廣佛華嚴經卷一' }).click();

  // Open comment thread
  await page.getByRole('button', { name: 'TL' }).click();

  const commentDialog = page.getByRole('dialog', { name: 'Comment Thread' });

  // Verify dialog structure
  await expect(commentDialog.getByRole('heading', { name: 'Comment Thread' })).toBeVisible();
  await expect(commentDialog.getByRole('separator', { name: 'Messages' })).toBeVisible();

  // Verify message structure
  const messages = commentDialog.locator('[role="generic"]').filter({ hasText: /TL|TP/ });
  await expect(messages).toHaveCount(2);

  // Verify input area
  await expect(commentDialog.getByRole('textbox')).toBeEditable();
  await expect(commentDialog.getByText('Mark as resolved')).toBeVisible();
});

/**
 * Task: Test comment system navigation flow
 *
 * This test validates the complete navigation flow from
 * dashboard to translation workspace and comment interaction.
 */
test('complete navigation flow to comment system', async ({ page }) => {
  // Verify we start from translation page
  await expect(page).toHaveURL(/.*\/translation$/);
  await expect(page.getByText('Tripitaka')).toBeVisible();

  // Verify breadcrumb navigation
  await expect(page.getByRole('navigation', { name: 'breadcrumb' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sutra' })).toBeVisible();

  // Navigate through the content hierarchy
  await page.getByRole('article').filter({ hasText: '大方廣佛華嚴經實叉難陀華嚴部類' }).click();

  // Verify expanded content shows chapters
  await expect(page.getByText('世界妙嚴品之一')).toBeVisible();
  await expect(page.getByText('大方廣佛華嚴經卷一')).toBeVisible();

  // Enter translation workspace
  await page.getByRole('link').filter({ hasText: '世界妙嚴品之一大方廣佛華嚴經卷一' }).click();

  // Verify we're in the translation workspace
  await expect(page).toHaveURL(/.*\/translation\/.*$/);
  await expect(page.getByRole('link', { name: 'Roll' })).toBeVisible();

  // Verify comment system is accessible
  await expect(page.getByRole('button', { name: 'TL' })).toBeVisible();
  await expect(page.getByText('2')).toBeVisible();
});
