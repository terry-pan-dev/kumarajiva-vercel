import { Mastra } from '@mastra/core';
import { createLogger } from '@mastra/core/logger';
import { PostgresStore } from '@mastra/pg';
import 'dotenv/config';

import * as agents from './agents';
import { assistantWorkflow } from './workflows/assistant-workflow';

const storage = new PostgresStore({
  connectionString: process.env.POSTGRES_URL || '',
});

export const mastra = new Mastra({
  agents,
  workflows: {
    assistantWorkflow,
  },
  logger: createLogger({
    name: 'assistant-workflow',
    level: 'info',
  }),
  storage,
});
