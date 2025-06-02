import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Glossary' }).click();
});

test('read glossary with pagination', async ({ page }) => {
  await expect(page.locator('ul:not(nav ul)').getByRole('listitem')).toHaveCount(10);
  await page.getByRole('link', { name: 'Go to next page' }).click();
  await expect(page.locator('ul:not(nav ul)').getByRole('listitem')).toHaveCount(10);
  await page.getByRole('link', { name: 'Go to previous page' }).click();
  await expect(page.locator('ul:not(nav ul)').getByRole('listitem')).toHaveCount(10);
});

test('verify first three pagination pages each return 10 records', async ({ page }) => {
  // Verify page 1 has 10 records
  await expect(page.locator('ul:not(nav ul)').getByRole('listitem')).toHaveCount(10);

  // Click page 2 and verify it has 10 records
  await page.getByRole('link', { name: '2', exact: true }).click();
  await expect(page).toHaveURL(/.*\/glossary\?page=2/);
  await expect(page.locator('ul:not(nav ul)').getByRole('listitem')).toHaveCount(10);

  // Click page 3 and verify it has 10 records
  await page.getByRole('link', { name: '3', exact: true }).click();
  await expect(page).toHaveURL(/.*\/glossary\?page=3/);
  await expect(page.locator('ul:not(nav ul)').getByRole('listitem')).toHaveCount(10);

  // Go back to page 1 and verify it still has 10 records
  await page.getByRole('link', { name: '1', exact: true }).click();
  await expect(page).toHaveURL(/.*\/glossary(\?page=1)?$/);
  await expect(page.locator('ul:not(nav ul)').getByRole('listitem')).toHaveCount(10);
});

test('create new glossary', async ({ page }) => {
  await page.getByRole('button', { name: 'New' }).click();
  // Try using getByRole('textbox') or getByPlaceholder() if the label is not properly associated
  // Or check if the label text exactly matches what's in the HTML
  await page.getByRole('textbox', { name: 'Glossary Chinese' }).fill('詞彙');
  await page.getByLabel('Glossary Chinese').press('Tab');
  await page.getByRole('textbox', { name: 'Glossary English' }).fill('Chinese');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('textbox', { name: 'Glossary Term' }).fill('詞彙');
  await page.getByRole('button', { name: 'Search' }).click();

  // Retry checking for text a few times with delay
  let found = false;
  for (let i = 0; i < 3; i++) {
    const mainContent = await page.getByRole('main').textContent();
    if (mainContent?.includes('詞彙') && mainContent?.includes('(cí huì)')) {
      found = true;
      break;
    }
    await page.waitForTimeout(1000); // Wait 1 second between checks
    await page.getByRole('button', { name: 'Search' }).click(); // Retry search
  }
  expect(found).toBe(true);
  await page.getByText('Search ⌘+K').click();
  await page.getByRole('searchbox', { name: 'Type to search...(max 50' }).fill('詞彙');
  await expect(page.locator('h2').filter({ hasText: '詞彙' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '(cí huì)' })).toBeVisible();
});

test('Update glossary', async ({ page }) => {
  await page.getByText('Search ⌘+K').click();
  await page.getByRole('searchbox', { name: 'Type to search...(max 50' }).fill('詞彙');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Glossary Chinese' }).fill('詞彙');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Search ⌘+K').click();
  await page.getByRole('searchbox', { name: 'Type to search...(max 50' }).fill('詞彙');
  await expect(page.locator('h2').filter({ hasText: '詞彙' })).toBeVisible();
});

/**
 * Task: Create a new glossary
 *
 * Arrange & Act:
 * 1. Click the Glossary link button on the left sidebar
 * 2. Click the "New" button on the top right
 * 3. For the Chinese Glossary Section, fill following fields with value (notice,
 * you don't have to fill in Phonetic field, and you have to open "Optional Fields
 * For Chinese" Accordion to fill the optional fields):
 *    - Glossary Chinese: 詞彙
 *    - Sutra Text: 《法華經》
 *    - Volume: 1b
 *    - CBETA Frequency: 100
 *    - Author: 鳩摩羅什
 *    - Discussion: here is stub discussion
 * 4. For the English Glossary section, fill following fields with value (notice
 * you have to open "Optional Fields For English Accordion to fill the optional
 * fields")
 *    - Glossary English: Glossary
 *    - Phonetic: glossary
 *    - Sutra Name: flower sutra
 *    - Part of Speech: noun
 *    - Sutra Text: some sutra text from flower sutra
 *    - Volume: 1b
 *    - Author: Translation Team
 * 5. Click the "Save" button
 *
 * Assert:
 * 1. Assert the glossary 詞彙 is showing in the first element of list on the left
 * content panel
 * 2. Assert the glossary 詞彙 and (cí huì) is showing in the detail panel on the right
 * 3. Assert the cbeta frequency is 100 on the bottom of the detail panel
 * 4. Assert the created user is "e2e-admin" on the bottom of the detail panel
 */
test('create comprehensive glossary with all fields', async ({ page }) => {
  // Arrange & Act: Navigate to glossary and click New button
  await page.getByRole('button', { name: 'New' }).click();

  // Wait for dialog to be visible
  await expect(page.getByRole('dialog', { name: 'Create Glossary For Chinese And English' })).toBeVisible();

  // Fill Chinese Glossary Section - Required fields
  await page.getByRole('textbox', { name: 'Glossary Chinese*' }).fill('詞彙');

  // Open Optional Fields For Chinese accordion
  await page.getByRole('button', { name: 'Optional Fields For Chinese' }).click();

  // Fill Chinese optional fields
  await page.getByRole('textbox', { name: 'Sutra Text' }).first().fill('《法華經》');
  await page.getByRole('textbox', { name: 'Volume' }).first().fill('1b');
  await page.getByRole('textbox', { name: 'CBETA Frequency' }).fill('100');
  await page.getByRole('textbox', { name: 'Author' }).first().fill('鳩摩羅什');
  await page.getByRole('textbox', { name: 'Discussion' }).fill('here is stub discussion');

  // Fill English Glossary Section - Required fields
  await page.getByRole('textbox', { name: 'Glossary English*' }).fill('Glossary');

  // Open Optional Fields For English accordion
  await page.getByRole('button', { name: 'Optional Fields For English' }).click();

  // Fill English optional fields
  await page.getByRole('textbox', { name: 'Phonetic' }).nth(1).fill('glossary');
  await page.getByRole('textbox', { name: 'Sutra Name' }).fill('flower sutra');
  await page.getByRole('textbox', { name: 'Part of Speech' }).fill('noun');
  await page.getByRole('textbox', { name: 'Sutra Text' }).nth(1).fill('some sutra text from flower sutra');
  await page.getByRole('textbox', { name: 'Volume' }).nth(1).fill('1b');
  await page.getByRole('textbox', { name: 'Author' }).nth(1).fill('Translation Team');

  // Save the glossary
  await page.getByRole('button', { name: 'Save' }).click();

  // Wait for dialog to close and page to update
  await expect(page.getByRole('dialog', { name: 'Create Glossary For Chinese And English' })).not.toBeVisible();

  // Assert: Verify the glossary appears in the first element of the list
  const firstListItem = page.locator('ul:not(nav ul)').getByRole('listitem').first();
  await expect(firstListItem.getByRole('heading', { name: '詞彙' })).toBeVisible();

  // Assert: Verify the glossary details in the right panel
  await expect(page.getByRole('heading', { name: '詞彙', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '(cí huì)', level: 2 })).toBeVisible();
  await expect(page.getByRole('separator')).toContainText('ENGLISH');

  // Assert: Verify CBETA frequency is 100 in the detail panel
  await expect(page.getByTitle('cbeta-frequency').filter({ hasText: '100' })).toBeVisible();

  // Assert: Verify the created user is "e2e-admin" in the detail panel
  await expect(page.getByTitle('author').filter({ hasText: 'e2e-admin' })).toBeVisible();
});

/**
 * Task: Update a glossary
 *
 * Arrange & Act:
 * 1. Click the Glossary link button on the left sidebar
 * 2. Click the "New" button on the top right
 * 3. For the Chinese Glossary Section, fill following fields with value (notice,
 * you don't have to fill in Phonetic field, and you have to open "Optional Fields
 * For Chinese" Accordion to fill the optional fields):
 *    - Glossary Chinese: 楞嚴
 *    - Sutra Text: 楞嚴經
 *    - Volume: 1b
 *    - CBETA Frequency: 100
 *    - Author: 般剌密帝
 *    - Discussion: here is stub discussion
 * 4. For the English Glossary section, fill following fields with value (notice
 * you have to open "Optional Fields For English Accordion to fill the optional
 * fields")
 *    - Glossary English: shurangama
 *    - Phonetic: léng yán
 *    - Sutra Name: shurangama sutra
 *    - Part of Speech: noun
 *    - Sutra Text: some sutra text from shurangama sutra
 *    - Volume: 1b
 *    - Author: Translation Team
 * 5. Click the "Save" button
 * 6. Find the glossary 楞嚴 card on the left panel list, and click it.
 * 7. On the right detail panel, click the "Edit" icon button.
 * 8. On the popup dialog, for the Chinese glossary section, modify the following
 * fields with value:
 *    - Phonetic: léng yán jīng shū
 *    - Volume: 2b
 *    - Author: Translation Team
 *    - CBETA Frequency: 101
 *    - Discussion: here is updated discussion
 * 9. For the English glossary section, modify the following fields with value:
 *    - Glossary: shurangama
 *    - Sutra Name: 楞嚴經
 *    - Volume: 2b
 *    - Origin Sutra Text: origin shurangama sutra text
 *    - Target Sutra Text: target shurangama sutra text
 *    - Phonetic: shurangama sutra
 *    - Part of Speech: noun
 *    - Author: Translation Team
 * 10. Click the "Save" button
 * 11. Find the glossary 楞嚴 card on the left panel list, and click it.
 *
 * Assert:
 * 1. Assert the glossary 楞嚴 is showing in the first element of list on the left
 * content panel
 * 2. Assert the glossary 楞嚴 and (léng yán jīng shū) is showing in the detail panel on the right
 * 3. Assert the discussion is "here is updated discussion" by hover the discussion icon on the detail panel and check the tooltip content
 * 4. Assert the separator is "ENGLISH" on the detail panel
 * 5. Assert the text "楞嚴經 | 2b" on the detail panel
 * 6. Assert the text "shurangama" on the detail panel
 * 7. Assert the text "origin shurangama sutra text" on the detail panel
 * 8. Assert the text "target shurangama sutra text" on the detail panel
 * 9. Assert the cbeta frequency is 101 on the bottom of the detail panel
 * 10. Assert the author is "Translation Team" on the bottom of the detail panel
 */
test.only('update comprehensive glossary with all fields', async ({ page }) => {
  // Arrange & Act: Navigate to glossary and click New button to create initial glossary
  await page.getByRole('button', { name: 'New' }).click();

  // Wait for dialog to be visible
  await expect(page.getByRole('dialog', { name: 'Create Glossary For Chinese And English' })).toBeVisible();

  // Fill Chinese Glossary Section - Required fields
  await page.getByRole('textbox', { name: 'Glossary Chinese*' }).fill('楞嚴');

  // Open Optional Fields For Chinese accordion
  await page.getByRole('button', { name: 'Optional Fields For Chinese' }).click();

  // Fill Chinese optional fields
  await page.getByRole('textbox', { name: 'Sutra Text' }).first().fill('楞嚴經');
  await page.getByRole('textbox', { name: 'Volume' }).first().fill('1b');
  await page.getByRole('textbox', { name: 'CBETA Frequency' }).fill('100');
  await page.getByRole('textbox', { name: 'Author' }).first().fill('般剌密帝');
  await page.getByRole('textbox', { name: 'Discussion' }).fill('here is stub discussion');

  // Fill English Glossary Section - Required fields
  await page.getByRole('textbox', { name: 'Glossary English*' }).fill('shurangama');

  // Open Optional Fields For English accordion
  await page.getByRole('button', { name: 'Optional Fields For English' }).click();

  // Fill English optional fields
  await page.getByRole('textbox', { name: 'Phonetic' }).nth(1).fill('léng yán');
  await page.getByRole('textbox', { name: 'Sutra Name' }).fill('shurangama sutra');
  await page.getByRole('textbox', { name: 'Part of Speech' }).fill('noun');
  await page.getByRole('textbox', { name: 'Sutra Text' }).nth(1).fill('some sutra text from shurangama sutra');
  await page.getByRole('textbox', { name: 'Volume' }).nth(1).fill('1b');
  await page.getByRole('textbox', { name: 'Author' }).nth(1).fill('Translation Team');

  // Save the glossary
  await page.getByRole('button', { name: 'Save' }).click();

  // Wait for dialog to close and page to update
  await expect(page.getByRole('dialog', { name: 'Create Glossary For Chinese And English' })).not.toBeVisible();

  // Step 6: Find the glossary 楞嚴 card on the left panel list, and click it
  const glossaryCard = page.locator('ul:not(nav ul)').getByRole('listitem').filter({ hasText: '楞嚴' }).first();
  await glossaryCard.click();

  // Step 7: On the right detail panel, click the "Edit" icon button
  await page.getByRole('button', { name: 'edit-glossary' }).click();

  // Wait for edit dialog to be visible
  await expect(page.getByRole('dialog', { name: 'Update Glossary' })).toBeVisible();

  // Step 8: For the Chinese glossary section, modify the following fields
  await page.getByRole('textbox', { name: 'Phonetic*' }).fill('léng yán jīng shū');
  await page.getByRole('textbox', { name: 'Author' }).first().fill('Translation Team');
  await page.getByRole('textbox', { name: 'CBETA Frequency' }).fill('101');
  await page.getByRole('textbox', { name: 'Discussion' }).fill('here is updated discussion');

  // Step 9: For the English glossary section, modify the following fields
  await page.getByRole('textbox', { name: 'Glossary*' }).nth(1).fill('shurangama');
  await page.getByRole('textbox', { name: 'Sutra Name*' }).fill('楞嚴經');
  await page.getByRole('textbox', { name: 'Volume*' }).fill('2b');
  await page.getByRole('textbox', { name: 'Origin Sutra Text' }).fill('origin shurangama sutra text');
  await page.getByRole('textbox', { name: 'Target Sutra Text' }).fill('target shurangama sutra text');
  await page.getByRole('textbox', { name: 'Phonetic' }).nth(1).fill('shurangama sutra');
  await page.getByRole('textbox', { name: 'Part of Speech' }).fill('noun');
  await page.getByRole('textbox', { name: 'Author' }).nth(1).fill('Translation Team');

  // Step 10: Click the "Save" button
  await page.getByRole('button', { name: 'Save' }).click();

  // Wait for dialog to close
  await expect(page.getByRole('dialog', { name: 'Update Glossary' })).not.toBeVisible();

  // Step 11: Find the glossary 楞嚴 card on the left panel list, and click it
  await glossaryCard.click();

  // Assert 1: Verify the glossary 楞嚴 is showing in the first element of list
  const firstListItem = page.locator('ul:not(nav ul)').getByRole('listitem').first();
  await expect(firstListItem.getByRole('heading', { name: '楞嚴' })).toBeVisible();

  // Assert 2: Verify the glossary 楞嚴 and (léng yán jīng shū) in the detail panel
  await expect(page.getByRole('heading', { name: '楞嚴', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '(léng yán jīng shū)', level: 2 })).toBeVisible();

  // Assert 3: Verify discussion by hovering the discussion icon and checking tooltip
  await page.getByRole('button', { name: 'discussion' }).hover();
  await expect(
    page.getByRole('tooltip', { name: 'discussion tooltip' }).filter({ hasText: 'here is updated discussion' }),
  ).toBeVisible();

  // Assert 4: Verify the separator is "ENGLISH" on the detail panel
  await expect(page.getByRole('separator')).toContainText('ENGLISH');

  // Assert 5: Verify the text "楞嚴經 | 2b" on the detail panel
  await expect(page.getByText('楞嚴經 | 2b')).toBeVisible();

  // Assert 6: Verify the text "shurangama" on the detail panel
  await expect(page.getByRole('heading', { name: 'shurangama', exact: true })).toBeVisible();

  // Assert 7: Verify the text "origin shurangama sutra text" on the detail panel
  await expect(page.getByText('origin shurangama sutra text', { exact: true })).toBeVisible();

  // Assert 8: Verify the text "target shurangama sutra text" on the detail panel
  await expect(page.getByText('target shurangama sutra text', { exact: true })).toBeVisible();

  // Assert 9: Verify CBETA frequency is 101 in the detail panel
  await expect(page.getByTitle('cbeta-frequency').filter({ hasText: '101' })).toBeVisible();

  // Assert 10: Verify the author is "Translation Team" in the detail panel
  await expect(page.getByTitle('author').filter({ hasText: 'Translation Team' })).toBeVisible();
});
