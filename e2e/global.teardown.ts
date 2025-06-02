import test from '@playwright/test';

import { deleteGlossariesByUserId } from '../app/services/glossary.service';

const cleanUpGlossary = async () => {
  const userId = process.env.E2E_ADMIN_ID;
  if (!userId) {
    throw new Error('E2E_ADMIN_ID is not set');
  }
  await deleteGlossariesByUserId(userId);
};

test('clean up', async () => {
  await cleanUpGlossary();
  console.log('Global teardown complete');
});
