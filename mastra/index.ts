import { Mastra, createLogger } from '@mastra/core';

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
