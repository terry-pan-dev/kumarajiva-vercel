import { Step, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { classifierAgent } from '../agents/classifier';
import { glossaryFinderAgent } from '../agents/glossary-finder';
import { transformerAgent } from '../agents/transformer';
import { translatorAgent } from '../agents/translator';

export const assistantWorkflow = new Workflow({
  name: 'Buddhist Sutra Translator',
  triggerSchema: z.object({
    languages: z.string().describe('The languages that the user understands'),
    inputText: z.string().describe('The text to translate'),
  }),
});

const classifyStep = new Step({
  id: 'classifyStep',
  description: 'Classify the text into different categories',
  inputSchema: z.object({
    inputText: z.string().describe('The text to classify'),
  }),
  outputSchema: z.object({
    category: z.enum(['translation', 'glossary', 'clarification', 'nonsupport', 'unknown']),
  }),
  execute: async ({ context }) => {
    const text = context?.getStepResult<{ inputText: string }>('trigger');
    const result = await classifierAgent.generate(text.inputText, {
      output: z
        .object({
          category: z
            .enum(['translation', 'glossary', 'clarification', 'nonsupport', 'unknown'])
            .describe('The category of the text'),
        })
        .describe('The category of the text'),
    });
    return result.object;
  },
});

const transformStep = new Step({
  id: 'transformStep',
  description: 'Clean the given text',
  inputSchema: z.object({
    category: z
      .enum(['translation', 'glossary', 'clarification', 'nonsupport', 'unknown'])
      .describe('The category of the text'),
  }),
  outputSchema: z.object({
    cleanedText: z.string().describe('The cleaned text'),
  }),
  execute: async ({ context }) => {
    const initialPrompt = context?.triggerData.inputText;
    const result = await transformerAgent.generate(initialPrompt, {
      output: z.object({
        cleanedText: z.string().describe('The cleaned text'),
      }),
    });
    return result.object;
  },
});

const translateStep = new Step({
  id: 'translateStep',
  description: 'Translate the text',
  inputSchema: z.object({
    cleanedText: z.string().describe('The cleaned text'),
  }),
  outputSchema: z.object({
    outputText: z.string().describe('The translated text'),
    reasoning: z.string().describe('The reasoning of the translation'),
  }),
  execute: async ({ context }) => {
    const { cleanedText } = context?.getStepResult<{
      cleanedText: string;
    }>('transformStep');
    const language = `
    <languages>
    ${context?.triggerData.languages}
    </languages>
    `;
    const prompt = `
    <text>
    ${cleanedText}
    </text>`;

    const response = await translatorAgent.generate(
      [
        {
          role: 'user',
          content: language,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      {
        experimental_output: z.object({
          outputText: z.string().describe('The translated text'),
          reasoning: z.string().describe('The reasoning of the translation'),
        }),
        maxSteps: 3,
        toolChoice: 'auto',
      },
    );
    console.log('response', response.object);
    return response.object;
  },
});

const glossaryStep = new Step({
  id: 'glossaryStep',
  description: 'Search internal Glossary',
  inputSchema: z.object({
    cleanedText: z.string().describe('The cleaned text to search glossary'),
  }),
  execute: async ({ context }) => {
    const languages = context?.triggerData.languages ?? 'chinese, english';
    const result = context?.getStepResult<{ cleanedText: string }>('transformStep');
    console.log('glossaryStep input', { languages, text: result.cleanedText });
    const response = await glossaryFinderAgent.generate(
      [
        {
          role: 'user',
          content: languages,
        },
        {
          role: 'user',
          content: result.cleanedText,
        },
      ],
      {
        maxSteps: 3,
        toolChoice: 'auto',
      },
    );
    console.log('glossaryStep response', response.text);
    return response.text;
  },
});

const clarificationStep = new Step({
  id: 'clarificationStep',
  description: 'Clarify the text',
  inputSchema: z.object({
    inputText: z.string().describe('The text to clarify'),
  }),
  outputSchema: z.string().describe('The clarified text'),
  execute: async ({ context }) => {
    return 'please clarify your question';
  },
});

const nonsupportStep = new Step({
  id: 'nonsupportStep',
  description: 'The text is not supported',
  inputSchema: z.object({
    inputText: z.string().describe('The text to clarify'),
  }),
  outputSchema: z.string().describe('The nonsupport text'),
  execute: async ({ context }) => {
    return 'The query language is not supported';
  },
});

const unknownStep = new Step({
  id: 'unknownStep',
  description: 'The text is unknown',
  inputSchema: z.object({
    inputText: z.string().describe('The text to clarify'),
  }),
  outputSchema: z.string().describe('The unknown text'),
  execute: async ({ context }) => {
    return 'We only support translation, search glossary';
  },
});

assistantWorkflow
  .step(classifyStep)
  .then(transformStep, {
    when: {
      or: [
        {
          'classifyStep.category': 'translation',
        },
        {
          'classifyStep.category': 'glossary',
        },
      ],
    },
  })
  .after(transformStep)
  .step(translateStep, {
    when: async (params) => {
      const { context } = params;
      if (context?.steps.classifyStep.status === 'success') {
        return context?.steps.classifyStep.output.category === 'translation';
      }
      return false;
    },
  })
  .step(glossaryStep, {
    when: async ({ context }) => {
      if (context?.steps.classifyStep.status === 'success') {
        return context?.steps.classifyStep.output.category === 'glossary';
      }
      return false;
    },
  })
  .after(classifyStep)
  .step(clarificationStep, {
    when: {
      'classifyStep.category': 'clarification',
    },
  })
  .step(nonsupportStep, {
    when: {
      'classifyStep.category': 'nonsupport',
    },
  })
  .step(unknownStep, {
    when: {
      'classifyStep.category': 'unknown',
    },
  })
  .commit();
