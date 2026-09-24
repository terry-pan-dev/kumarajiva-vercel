import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { CFB } from 'xlsx';

import {
  buildWorkingDocument,
  buildWorkingDocumentFilename,
  type WorkingDocumentPassage,
} from '~/services/workingDocument.docx';
import { type WorkingDocumentFormat } from '~/validations/workingDocument.validation';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const plain = { bold: false, italic: false };
const defaults: WorkingDocumentFormat = {
  blocks: [
    { key: 'source', label: 'Source', font: 'Noto Serif TC', color: '#000000', ...plain },
    { key: 'target', label: 'Translation', font: 'Times New Roman', color: '#1d4ed8', ...plain },
    { key: 'reference:ref-a', label: 'Btts', font: 'Times New Roman', color: '#6b7280', ...plain },
    { key: 'reference:ref-b', label: 'Commentary', font: 'Times New Roman', color: '#047857', ...plain },
  ],
};

const passage = (overrides: Partial<WorkingDocumentPassage> = {}): WorkingDocumentPassage => ({
  paragraphId: 'p-1',
  number: '1.1',
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
    const [source, target, ...refs] = defaults.blocks;
    const xml = await documentXml([passage()], {
      blocks: [{ ...target, label: 'Draft', italic: true }, source, ...refs],
    });

    expect(inOrder(xml, ['Draft: ', 'Thus I have heard', 'Source: ', '如是我聞'])).toBe(true);
    expect(xml).toContain('<w:i/>');
  });

  it('heads each new section with its title in both languages', async () => {
    const xml = await documentXml([
      passage(),
      passage({ number: '1.2' }),
      passage({ number: '2.1', sectionId: 's2', sectionTitle: '方便品第二', targetSectionTitle: 'Chapter 2' }),
    ]);

    expect(xml.split('Chapter 1').length - 1).toBe(1);
    expect(inOrder(xml, ['序品第一', 'Chapter 1', '1.2', '方便品第二', 'Chapter 2', '2.1'])).toBe(true);
  });
});

describe('buildWorkingDocumentFilename', () => {
  it('names the file after the project and paragraph range', () => {
    expect(buildWorkingDocumentFilename('Team A', [passage(), passage({ number: '1.9' })])).toBe('Team A 1.1–1.9.docx');
    expect(buildWorkingDocumentFilename('A/B', [passage()])).toBe('AB 1.1.docx');
  });
});
