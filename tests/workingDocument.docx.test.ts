import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { CFB } from 'xlsx';

import {
  buildWorkingDocument,
  buildWorkingDocumentFilename,
  type WorkingDocumentPassage,
} from '~/services/workingDocument.docx';
import {
  type WorkingDocumentFormat,
  workingDocumentBlockPrefix,
  workingDocumentFormatSchema,
} from '~/validations/workingDocument.validation';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const plain = { bold: false, italic: false };
const shown = { size: 11, visible: true, labelBreak: false, ...plain };
const number = {
  id: 'number',
  key: 'number',
  label: '',
  font: 'Times New Roman' as const,
  color: '#808080',
  ...shown,
  size: 8,
};
const defaults: WorkingDocumentFormat = {
  blocks: [
    number,
    { id: 'source', key: 'source', label: 'Source', font: 'Noto Serif TC', color: '#000000', ...shown },
    { id: 'target', key: 'target', label: 'Translation', font: 'Times New Roman', color: '#1d4ed8', ...shown },
    { id: 'ref-a', key: 'reference:ref-a', label: 'Btts', font: 'Times New Roman', color: '#6b7280', ...shown },
    {
      id: 'ref-b',
      key: 'reference:ref-b',
      label: 'Commentary',
      font: 'Times New Roman',
      color: '#047857',
      ...shown,
    },
  ],
};

const passage = (overrides: Partial<WorkingDocumentPassage> = {}): WorkingDocumentPassage => ({
  paragraphId: 'p-1',
  number: '1',
  sectionId: 's1',
  sectionTitle: '序品第一',
  targetSectionTitle: 'Chapter 1',
  texts: {
    source: '如是我聞',
    target: 'Thus I have heard',
    'reference:ref-a': 'Thus have I heard',
    'reference:ref-b': null,
  },
  ...overrides,
});

// A .docx is a zip; xlsx's container reader opens it without another dependency.
const documentXml = async (passages: WorkingDocumentPassage[], format: WorkingDocumentFormat = defaults) => {
  const doc = buildWorkingDocument(passages, format.blocks, {
    titles: ['妙法蓮華經', 'The Lotus Sutra'],
    subtitle: 'Translation group working document',
    showPages: format.showPages,
  });
  const entry = CFB.find(CFB.read(await Packer.toBuffer(doc), { type: 'buffer' }), '/word/document.xml');
  return Buffer.from(entry!.content as Uint8Array).toString('utf8');
};

const inOrder = (xml: string, texts: string[]) => {
  const positions = texts.map((t) => xml.indexOf(t));
  return positions.every((p) => p >= 0) && positions.every((p, i) => i === 0 || p > positions[i - 1]);
};

// ─── Document ────────────────────────────────────────────────────────────────

describe('buildWorkingDocument', () => {
  it('opens with both document titles and the subtitle', async () => {
    expect(
      inOrder(await documentXml([passage()]), ['妙法蓮華經', 'The Lotus Sutra', 'Translation group working']),
    ).toBe(true);
  });

  it('writes labelled texts in format order, with their colours and fonts', async () => {
    const xml = await documentXml([passage()]);

    expect(inOrder(xml, ['Source: ', '如是我聞', 'Translation: ', 'Thus I have heard', 'Btts: ', 'Thus have I'])).toBe(
      true,
    );
    expect(xml).toContain('w:val="1d4ed8"');
    expect(xml).toContain('w:eastAsia="Noto Serif TC"');
    expect(xml).not.toContain('Commentary: ');
  });

  it('follows a reordered, restyled format', async () => {
    const [, source, target, ...refs] = defaults.blocks;
    const xml = await documentXml([passage()], {
      blocks: [{ ...target, label: 'Draft', italic: true }, source, ...refs],
    });

    expect(inOrder(xml, ['Draft: ', 'Thus I have heard', 'Source: ', '如是我聞'])).toBe(true);
    expect(xml).toContain('<w:i/>');
  });

  it('writes each entry at its font size', async () => {
    const [, source, ...rest] = defaults.blocks;
    const xml = await documentXml([passage()], { blocks: [{ ...source, size: 14 }, ...rest] });

    expect(xml).toContain('<w:sz w:val="28"/>');
    expect(xml).toContain('<w:sz w:val="22"/>');
  });

  it('starts the text on a new line after the label when asked', async () => {
    const [, source, ...rest] = defaults.blocks;
    const xml = await documentXml([passage()], { blocks: [{ ...source, labelBreak: true }, ...rest] });

    expect(xml).toMatch(/>Source:<\/w:t><\/w:r><w:r>.*?<w:br\/>.*?如是我聞/);
    expect(xml).toContain('Translation: ');
  });

  it('leaves hidden entries out', async () => {
    const [, source, target, ...refs] = defaults.blocks;
    const xml = await documentXml([passage()], { blocks: [source, { ...target, visible: false }, ...refs] });

    expect(xml).not.toContain('Translation: ');
    expect(xml).not.toContain('Thus I have heard');
    expect(inOrder(xml, ['Source: ', '如是我聞', 'Btts: ', 'Thus have I'])).toBe(true);
  });

  it('prints a text once for each of its entries', async () => {
    const [, source, target, ...refs] = defaults.blocks;
    const xml = await documentXml([passage()], {
      blocks: [source, target, ...refs, { ...source, id: 'source#2', label: 'Again', bold: true }],
    });

    expect(xml.split('如是我聞').length - 1).toBe(2);
    expect(inOrder(xml, ['Source: ', 'Btts: ', 'Again: '])).toBe(true);
    expect(xml.lastIndexOf('如是我聞')).toBeGreaterThan(xml.indexOf('Again: '));
  });

  it('heads each new section with its title in both languages', async () => {
    const xml = await documentXml([
      passage({ number: '5' }),
      passage({ number: '6', texts: { source: '一時佛住' } }),
      passage({
        sectionId: 's2',
        sectionTitle: '方便品第二',
        targetSectionTitle: 'Chapter 2',
        texts: { source: '爾時世尊' },
      }),
    ]);

    expect(xml.split('Chapter 1').length - 1).toBe(1);
    expect(
      inOrder(xml, ['序品第一', 'Chapter 1', '>6<', '一時佛住', '方便品第二', 'Chapter 2', '>1<', '爾時世尊']),
    ).toBe(true);
  });
});

describe('paragraph numbers', () => {
  const [, ...texts] = defaults.blocks;

  it('prints each passage’s number where its entry is, directly above the next entry', async () => {
    const xml = await documentXml([passage({ number: '7' })]);

    expect(inOrder(xml, ['>7<', 'Source: '])).toBe(true);
    expect(xml).toMatch(/>7<\/w:t><\/w:r><\/w:p><w:p><w:r>.*?Source: /);
  });

  it('formats the number like any entry, label included', async () => {
    const xml = await documentXml([passage({ number: '7' })], {
      blocks: [...texts, { ...number, label: '§', color: '#ff0000', size: 12, bold: true }],
    });

    expect(inOrder(xml, ['Thus have I', '§: ', '>7<'])).toBe(true);
    expect(xml).toContain('w:val="ff0000"');
    expect(xml).toContain('<w:sz w:val="24"/>');
  });

  it('leaves the number out when its entry is hidden or missing', async () => {
    const hidden = await documentXml([passage({ number: '7' })], { blocks: [{ ...number, visible: false }, ...texts] });
    const missing = await documentXml([passage({ number: '7' })], { blocks: texts });

    expect(hidden).not.toContain('>7<');
    expect(missing).not.toContain('>7<');
    expect(hidden).toContain('Source: ');
  });
});

describe('page numbers', () => {
  const withPages = passage({ pages: { source: '0026c01', target: null, 'reference:ref-a': '201' } });

  it('prints each text’s page after its label', async () => {
    const xml = await documentXml([withPages]);

    expect(inOrder(xml, ['Source (p. 0026c01): ', '如是我聞', 'Translation: ', 'Btts (p. 201): ', 'Thus have I'])).toBe(
      true,
    );
  });

  it('leaves every page out when page numbers are switched off', async () => {
    const xml = await documentXml([withPages], { ...defaults, showPages: false });

    expect(inOrder(xml, ['Source: ', '如是我聞', 'Btts: ', 'Thus have I'])).toBe(true);
    expect(xml).not.toContain('(p.');
  });

  it('prints the page alone when the label is blank', async () => {
    const [, source, ...rest] = defaults.blocks;
    const xml = await documentXml([withPages], { blocks: [{ ...source, label: '' }, ...rest] });

    expect(inOrder(xml, ['(p. 0026c01) ', '如是我聞'])).toBe(true);
  });

  it('writes plain labels for passages without pages', async () => {
    const xml = await documentXml([passage()]);
    expect(xml).not.toContain('(p.');
  });
});

describe('workingDocumentBlockPrefix', () => {
  it('combines label and page', () => {
    expect(workingDocumentBlockPrefix('Cleary', '201', true)).toBe('Cleary (p. 201): ');
  });

  it('shows the page when the setting is unset, as in formats saved before it existed', () => {
    expect(workingDocumentBlockPrefix('Cleary', '201', undefined)).toBe('Cleary (p. 201): ');
  });

  it('drops the page when switched off, missing or blank', () => {
    expect(workingDocumentBlockPrefix('Cleary', '201', false)).toBe('Cleary: ');
    expect(workingDocumentBlockPrefix('Cleary', null, true)).toBe('Cleary: ');
    expect(workingDocumentBlockPrefix('Cleary', '  ', true)).toBe('Cleary: ');
  });

  it('is the page alone, or nothing, without a label', () => {
    expect(workingDocumentBlockPrefix('', '201', true)).toBe('(p. 201) ');
    expect(workingDocumentBlockPrefix('', null, true)).toBe('');
  });
});

describe('workingDocumentFormatSchema', () => {
  it('still accepts a saved format from before the page and number switches', () => {
    const saved = { blocks: [{ key: 'source', label: 'Source', font: 'Noto Serif TC', color: '#000000', ...plain }] };
    expect(workingDocumentFormatSchema.safeParse(saved).success).toBe(true);
  });

  it('gives entries saved before ids, sizes and hiding their key as id, the default size, and shows them', () => {
    const saved = { blocks: [{ key: 'source', label: 'Source', font: 'Noto Serif TC', color: '#000000', ...plain }] };
    expect(workingDocumentFormatSchema.parse(saved).blocks[0]).toMatchObject({
      id: 'source',
      size: 11,
      visible: true,
    });
  });
});

describe('buildWorkingDocumentFilename', () => {
  it('names the file after the project and the paragraph range with its section', () => {
    expect(buildWorkingDocumentFilename('Team A', [passage(), passage({ number: '9' })])).toBe(
      'Team A 序品第一 1–9.docx',
    );
    expect(buildWorkingDocumentFilename('A/B', [passage()])).toBe('AB 序品第一 1.docx');
  });

  it('names both sections when the range crosses into another', () => {
    const next = passage({ number: '4', sectionId: 's2', sectionTitle: '方便品第二' });
    expect(buildWorkingDocumentFilename('Team A', [passage({ number: '30' }), next])).toBe(
      'Team A 序品第一 30–方便品第二 4.docx',
    );
  });

  it('uses the bare numbers for untitled sections', () => {
    expect(
      buildWorkingDocumentFilename('Team A', [
        passage({ sectionTitle: null }),
        passage({ number: '9', sectionTitle: null }),
      ]),
    ).toBe('Team A 1–9.docx');
  });
});
