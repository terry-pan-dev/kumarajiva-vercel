import { beforeEach, describe, expect, it, vi } from 'vitest';

import { action as assistantAction } from '~/routes/_app.assistant._index';
import { action as translateAction } from '~/routes/openai';

// Where the AI features get their languages from, now that users no longer carry a language
// pair: the editor's AI translation from the project's documents, the assistant from the
// language chosen on its page (default English). OpenAI is mocked; the prompts are inspected.
const mocks = vi.hoisted(() => ({
  assertAuthUser: vi.fn(),
  resolveSectionContext: vi.fn(),
  parse: vi.fn(),
  create: vi.fn(),
  responsesCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { parse: mocks.parse, create: mocks.create } };
    responses = { create: mocks.responsesCreate };
  },
}));
vi.mock('openai/helpers/zod', () => ({ zodResponseFormat: () => ({}) }));
vi.mock('~/auth.server', () => ({ assertAuthUser: mocks.assertAuthUser }));
vi.mock('~/services/project.service', () => ({ resolveSectionContext: mocks.resolveSectionContext }));
vi.mock('~/services/glossary.service', () => ({ searchGlossaries: vi.fn(async () => ({})) }));
vi.mock('~/services/tokenizer.service', () => ({ tokenizer: vi.fn(async () => []) }));

// A session issued before users.origin_lang / target_lang were dropped still carries the old pair;
// it would give the wrong answer if anything still read it.
const user = { id: 'u1', role: 'editor', originLang: 'sanskrit', targetLang: 'english' };

const doc = (language: string) => ({ id: `d-${language}`, key: null, title: language, language });
const context = (source: string, target: string) => ({
  projectId: 'p1',
  passageKeyPrefix: 'x',
  origin: { document: doc(source), section: { id: 's1', title: null, order: 1 } },
  target: { document: doc(target), section: null },
  references: [],
});

const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAuthUser.mockResolvedValue(user);
  mocks.parse.mockResolvedValue({ choices: [{ message: { parsed: { tokens: [] } } }] });
  mocks.create.mockResolvedValue((async function* () {})());
  mocks.responsesCreate.mockResolvedValue({ output_text: '{"category":"clarification","reasoning":"test"}' });
});

// ─── Editor AI translation (/openai) ─────────────────────────────────────────

describe('AI translation in the editor', () => {
  const translate = (body: Record<string, unknown>) =>
    translateAction({ request: post('/openai', body), params: {}, context: {} }) as Promise<Response>;

  it("translates between the project's document languages, not the user's", async () => {
    mocks.resolveSectionContext.mockResolvedValue(context('chinese', 'indonesian'));
    await translate({ origin: '如是我聞', originId: 'p', projectId: 'p1', sectionId: 's1' });

    expect(mocks.resolveSectionContext).toHaveBeenCalledWith('p1', 's1');
    const systemPrompt: string = mocks.create.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('translating an ancient chinese Buddhist sutra text into indonesian');
    expect(systemPrompt).not.toContain('sanskrit');
  });

  it('refuses, without calling OpenAI, when the section is not in the project', async () => {
    mocks.resolveSectionContext.mockResolvedValue(null);
    const response = await translate({ origin: '如是我聞', projectId: 'p1', sectionId: 'elsewhere' });
    expect(response.status).toBe(404);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // The old card sent only a roll/section id; without a project there is no language pair.
  it('refuses a request that names no project', async () => {
    const response = await translate({ origin: '如是我聞', rollId: 's1' });
    expect(response.status).toBe(404);
    expect(mocks.resolveSectionContext).not.toHaveBeenCalled();
  });

  it('does nothing for empty text', async () => {
    await translate({ origin: '   ', projectId: 'p1', sectionId: 's1' });
    expect(mocks.resolveSectionContext).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

// ─── Assistant ───────────────────────────────────────────────────────────────

describe('assistant', () => {
  const ask = async (body: Record<string, unknown>) => {
    const original = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test';
    try {
      await assistantAction({ request: post('/assistant', body), params: {}, context: {} });
    } finally {
      process.env.OPENAI_API_KEY = original;
    }
    return mocks.responsesCreate.mock.calls[0][0].instructions as string;
  };

  it('answers in the language chosen on the page', async () => {
    expect(await ask({ message: '法', targetLanguage: 'indonesian' })).toContain(
      'Language to answer and translate into: indonesian',
    );
  });

  it('defaults to English, whatever pair an old session still carries', async () => {
    const instructions = await ask({ message: '法' });
    expect(instructions).toContain('Language to answer and translate into: english');
    expect(instructions).not.toContain('sanskrit to');
  });

  it('ignores a language it does not support', async () => {
    expect(await ask({ message: '法', targetLanguage: 'klingon' })).toContain(
      'Language to answer and translate into: english',
    );
  });
});
