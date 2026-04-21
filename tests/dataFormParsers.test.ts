import { describe, expect, it } from 'vitest';

import { parseRollCreate, parseRollUpdate, parseSutraCreate, parseSutraUpdate } from '~/utils/dataFormParsers';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

// ─── parseSutraCreate ─────────────────────────────────────────────────────────

describe('parseSutraCreate', () => {
  it('returns all fields from form data', () => {
    const fd = makeFormData({
      originTitle: '大般若波羅蜜多經',
      originSubtitle: 'Origin subtitle',
      originLang: 'chinese',
      originTranslator: 'Xuanzang',
      translationTitle: 'The Great Prajnaparamita Sutra',
      translationSubtitle: 'Translation subtitle',
      translationLang: 'english',
      translationTranslator: 'Bhikkhu Bodhi',
      category: 'Prajnaparamita',
      cbeta: 'T0220',
    });

    expect(parseSutraCreate(fd)).toEqual({
      originTitle: '大般若波羅蜜多經',
      originSubtitle: 'Origin subtitle',
      originLang: 'chinese',
      originTranslator: 'Xuanzang',
      translationTitle: 'The Great Prajnaparamita Sutra',
      translationSubtitle: 'Translation subtitle',
      translationLang: 'english',
      translationTranslator: 'Bhikkhu Bodhi',
      category: 'Prajnaparamita',
      cbeta: 'T0220',
    });
  });

  it('coerces empty string subtitles to empty string', () => {
    const fd = makeFormData({
      originTitle: '大般若',
      originSubtitle: '',
      originLang: 'chinese',
      originTranslator: '',
      translationTitle: '',
      translationSubtitle: '',
      translationLang: '',
      translationTranslator: '',
      category: '',
      cbeta: '',
    });

    const result = parseSutraCreate(fd);
    expect(result.originSubtitle).toBe('');
    expect(result.translationSubtitle).toBe('');
  });

  it('coerces absent optional fields to empty strings', () => {
    const fd = makeFormData({
      originTitle: '大般若',
      originLang: 'chinese',
      translationTitle: '',
      translationLang: '',
    });

    const result = parseSutraCreate(fd);
    expect(result.category).toBe('');
    expect(result.originTranslator).toBe('');
    expect(result.translationTranslator).toBe('');
    expect(result.cbeta).toBe('');
  });
});

// ─── parseSutraUpdate ─────────────────────────────────────────────────────────

describe('parseSutraUpdate', () => {
  it('includes sutraId and childSutraId alongside sutra create fields', () => {
    const fd = makeFormData({
      sutraId: 'sutra-123',
      childSutraId: 'child-456',
      originTitle: '大般若',
      originLang: 'chinese',
      originTranslator: '',
      translationTitle: 'Great Sutra',
      translationLang: 'english',
      translationTranslator: '',
      category: '',
      cbeta: '',
    });

    const result = parseSutraUpdate(fd);
    expect(result.sutraId).toBe('sutra-123');
    expect(result.childSutraId).toBe('child-456');
    expect(result.originTitle).toBe('大般若');
  });

  it('coerces missing childSutraId to null', () => {
    const fd = makeFormData({
      sutraId: 'sutra-123',
      originTitle: '大般若',
      originLang: 'chinese',
      translationTitle: '',
      translationLang: '',
    });

    expect(parseSutraUpdate(fd).childSutraId).toBeNull();
  });
});

// ─── parseRollCreate ──────────────────────────────────────────────────────────

describe('parseRollCreate', () => {
  it('returns all fields from form data', () => {
    const fd = makeFormData({
      sutraId: 'sutra-abc',
      childSutraId: 'child-sutra-xyz',
      originTitle: '卷一',
      originSubtitle: 'First volume',
      translationTitle: 'Volume One',
      translationSubtitle: 'The first',
    });

    expect(parseRollCreate(fd)).toEqual({
      sutraId: 'sutra-abc',
      childSutraId: 'child-sutra-xyz',
      originTitle: '卷一',
      originSubtitle: 'First volume',
      translationTitle: 'Volume One',
      translationSubtitle: 'The first',
    });
  });

  it('coerces missing childSutraId to null', () => {
    const fd = makeFormData({
      sutraId: 'sutra-abc',
      originTitle: '卷一',
      translationTitle: 'Volume One',
    });

    expect(parseRollCreate(fd).childSutraId).toBeNull();
  });

  it('coerces empty subtitles to empty string', () => {
    const fd = makeFormData({
      sutraId: 'sutra-abc',
      originTitle: '卷一',
      originSubtitle: '',
      translationTitle: 'Volume One',
      translationSubtitle: '',
    });

    const result = parseRollCreate(fd);
    expect(result.originSubtitle).toBe('');
    expect(result.translationSubtitle).toBe('');
  });
});

// ─── parseRollUpdate ──────────────────────────────────────────────────────────

describe('parseRollUpdate', () => {
  it('includes rollId and childRollId alongside roll create fields', () => {
    const fd = makeFormData({
      sutraId: 'sutra-abc',
      rollId: 'roll-111',
      childRollId: 'roll-222',
      originTitle: '卷一',
      translationTitle: 'Volume One',
    });

    const result = parseRollUpdate(fd);
    expect(result.rollId).toBe('roll-111');
    expect(result.childRollId).toBe('roll-222');
    expect(result.originTitle).toBe('卷一');
  });

  it('coerces missing childRollId to null', () => {
    const fd = makeFormData({
      sutraId: 'sutra-abc',
      rollId: 'roll-111',
      originTitle: '卷一',
      translationTitle: 'Volume One',
    });

    expect(parseRollUpdate(fd).childRollId).toBeNull();
  });
});
