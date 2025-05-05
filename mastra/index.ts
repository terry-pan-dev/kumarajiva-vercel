import { Mastra } from '@mastra/core';
import { createLogger } from '@mastra/core/logger';
import 'dotenv/config';

import * as agents from './agents';
import { assistantWorkflow } from './workflows/assistant-workflow';

export const mastra = new Mastra({
  agents,
  workflows: {
    assistantWorkflow,
  },
  logger: createLogger({
    name: 'assistant-workflow',
    level: 'info',
  }),
});
