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
    resourceId: z.string().describe('The id of the user'),
    threadId: z.string().describe('The id of the thread'),
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
      resourceId: context?.triggerData.resourceId,
      threadId: context?.triggerData.threadId,
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
    result: z.string().describe('The result of the cleaned text'),
  }),
  execute: async ({ context }) => {
    const initialPrompt = context?.triggerData.inputText;
    const result = await transformerAgent.generate(initialPrompt, {
      resourceId: context?.triggerData.resourceId,
      threadId: context?.triggerData.threadId,
      output: z.object({
        result: z.string().describe('The cleaned text'),
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
    result: z.string().describe('The translated text'),
    reasoning: z.string().describe('If you have any notes or explanations about specific translation choices,'),
  }),
  execute: async ({ context }) => {
    const { result } = context?.getStepResult<{
      result: string;
    }>('transformStep');
    const language = `
    <languages>
    ${context?.triggerData.languages}
    </languages>
    `;
    const prompt = `
    <text>
    ${result}
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
        resourceId: context?.triggerData.resourceId,
        threadId: context?.triggerData.threadId,
        maxSteps: 3,
        toolChoice: 'auto',
        experimental_output: z.object({
          result: z.string().describe('The translated text'),
          reasoning: z
            .string()
            .describe(
              'The reasoning of the translation, you should include the evidence of the glossary search. If you have any notes or explanations about specific translation choices, you should include them in the reasoning as well.',
            ),
        }),
      },
    );
    return response.object;
  },
});

const glossaryStep = new Step({
  id: 'glossaryStep',
  description: 'Search internal Glossary',
  inputSchema: z.object({
    result: z.string().describe('The returned glossary result'),
  }),
  outputSchema: z.object({
    result: z.string().describe('The summary of the glossary search'),
    reasoning: z.string().describe('The evidence of the glossary search'),
  }),
  execute: async ({ context }) => {
    const languages = context?.triggerData.languages ?? 'chinese, english';
    const transformedText = context?.getStepResult<{ result: string }>('transformStep');
    console.log(`glossaryStep, languages: "${languages}", text: "${transformedText.result}"`);
    const response = await glossaryFinderAgent.generate(
      [
        {
          role: 'user',
          content: languages,
        },
        {
          role: 'user',
          content: transformedText.result,
        },
      ],
      {
        resourceId: context?.triggerData.resourceId,
        threadId: context?.triggerData.threadId,
        maxSteps: 5,
        toolChoice: 'auto',
        experimental_output: z.object({
          result: z.string().describe('The summary of the glossary search'),
          reasoning: z.string().describe('The evidence of the glossary search'),
        }),
      },
    );
    return response.object;
  },
});

const clarificationStep = new Step({
  id: 'clarificationStep',
  description: 'Clarify the text',
  execute: async ({ context }) => {
    // return a stream of text
    return {
      result:
        'please clarify your question, try to be more specific. For example, "I want to translate A to B", "I want to search glossary A"',
    };
  },
});

const nonsupportStep = new Step({
  id: 'nonsupportStep',
  description: 'The text is not supported',
  execute: async ({ context }) => {
    return {
      result: 'The query language is not supported',
    };
  },
});

const unknownStep = new Step({
  id: 'unknownStep',
  description: 'The text is unknown',
  execute: async ({ context }) => {
    return {
      result: 'We only support translation and glossary search',
    };
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
