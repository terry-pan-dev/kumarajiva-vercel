import { describe, expect, it } from 'vitest';

import { createDocumentSchema } from '~/validations/document.validation';
import { createSectionSchema } from '~/validations/section.validation';

// ─── createDocumentSchema ─────────────────────────────────────────────────────

describe('createDocumentSchema', () => {
  it('accepts valid input', () => {
    const result = createDocumentSchema.safeParse({ title: 'Diamond Sutra', translator: 'Xuanzang' });
    expect(result.success).toBe(true);
  });

  it('accepts optional subtitle when provided', () => {
    const result = createDocumentSchema.safeParse({
      title: 'Diamond Sutra',
      translator: 'Xuanzang',
      subtitle: 'A new translation',
    });
    expect(result.success).toBe(true);
  });

  it('accepts missing subtitle', () => {
    const result = createDocumentSchema.safeParse({ title: 'Diamond Sutra', translator: 'Xuanzang' });
    expect(result.success).toBe(true);
    expect((result as { data: object }).data).not.toHaveProperty('subtitle');
  });

  it('rejects empty title', () => {
    const result = createDocumentSchema.safeParse({ title: '', translator: 'Xuanzang' });
    expect(result.success).toBe(false);
  });

  it('rejects missing title', () => {
    const result = createDocumentSchema.safeParse({ translator: 'Xuanzang' });
    expect(result.success).toBe(false);
  });

  it('rejects empty translator', () => {
    const result = createDocumentSchema.safeParse({ title: 'Diamond Sutra', translator: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing translator', () => {
    const result = createDocumentSchema.safeParse({ title: 'Diamond Sutra' });
    expect(result.success).toBe(false);
  });
});

// ─── createSectionSchema ──────────────────────────────────────────────────────

describe('createSectionSchema', () => {
  it('accepts valid title', () => {
    const result = createSectionSchema.safeParse({ title: 'Chapter One' });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = createSectionSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing title', () => {
    const result = createSectionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
