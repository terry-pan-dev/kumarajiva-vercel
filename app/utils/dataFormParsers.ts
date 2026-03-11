import type { Lang } from '~/utils/constants';

// ─── Sutra ───────────────────────────────────────────────────────────────────

export type SutraCreatePayload = {
  originTitle: string;
  originSubtitle: string;
  originLang: Lang;
  originTranslator: string;
  translationTitle: string;
  translationSubtitle: string;
  translationLang: Lang;
  translationTranslator: string;
  category: string;
  cbeta: string;
};

export type SutraUpdatePayload = SutraCreatePayload & {
  sutraId: string;
  childSutraId: string | null;
};

export function parseSutraCreate(formData: FormData): SutraCreatePayload {
  return {
    originTitle: formData.get('originTitle') as string,
    originSubtitle: (formData.get('originSubtitle') as string) || '',
    originLang: formData.get('originLang') as Lang,
    originTranslator: (formData.get('originTranslator') as string) || '',
    translationTitle: formData.get('translationTitle') as string,
    translationSubtitle: (formData.get('translationSubtitle') as string) || '',
    translationLang: formData.get('translationLang') as Lang,
    translationTranslator: (formData.get('translationTranslator') as string) || '',
    category: (formData.get('category') as string) || '',
    cbeta: (formData.get('cbeta') as string) || '',
  };
}

export function parseSutraUpdate(formData: FormData): SutraUpdatePayload {
  return {
    ...parseSutraCreate(formData),
    sutraId: formData.get('sutraId') as string,
    childSutraId: (formData.get('childSutraId') as string) || null,
  };
}

// ─── Roll ────────────────────────────────────────────────────────────────────

export type RollCreatePayload = {
  sutraId: string;
  childSutraId: string | null;
  originTitle: string;
  originSubtitle: string;
  translationTitle: string;
  translationSubtitle: string;
};

export type RollUpdatePayload = RollCreatePayload & {
  rollId: string;
  childRollId: string | null;
};

export function parseRollCreate(formData: FormData): RollCreatePayload {
  return {
    sutraId: formData.get('sutraId') as string,
    childSutraId: (formData.get('childSutraId') as string) || null,
    originTitle: formData.get('originTitle') as string,
    originSubtitle: (formData.get('originSubtitle') as string) || '',
    translationTitle: formData.get('translationTitle') as string,
    translationSubtitle: (formData.get('translationSubtitle') as string) || '',
  };
}

export function parseRollUpdate(formData: FormData): RollUpdatePayload {
  return {
    ...parseRollCreate(formData),
    rollId: formData.get('rollId') as string,
    childRollId: (formData.get('childRollId') as string) || null,
  };
}
