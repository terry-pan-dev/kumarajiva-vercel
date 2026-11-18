// The raw arrays (Source of Truth)
export const LANG_VALUES = ['chinese', 'english', 'sanskrit', 'indonesian'] as const;
export const ROLE_VALUES = ['admin', 'leader', 'editor', 'reader', 'assistant', 'manager', 'tech'] as const;
export const NOTIFICATION_VALUES = ['info', 'error', 'success', 'warning'] as const;
export const CONTRIBUTOR_ROLE_VALUES = ['author', 'translator', 'commentator', 'editor'] as const;
// Glossary suggestions (docs/plans/glossary-suggestions.md). Adding a value later means an
// ALTER TYPE ... ADD VALUE migration, e.g. 'paragraph' when translation paragraphs get suggestions.
export const SUGGESTION_TARGET_VALUES = ['glossary_term', 'glossary_translation'] as const;
export const SUGGESTION_ACTION_VALUES = ['create', 'edit', 'flag'] as const;
export const SUGGESTION_STATUS_VALUES = ['pending', 'accepted', 'rejected', 'withdrawn', 'dismissed'] as const;
export const REVIEW_VERDICT_VALUES = ['looks_right', 'needs_work'] as const;

// The UI-friendly objects (Derived from the arrays)
export const SUPPORTED_LANGUAGES = LANG_VALUES.map((val) => ({
  value: val,
  label: val.charAt(0).toUpperCase() + val.slice(1),
}));

export const DEFAULT_ORIGIN_LANG = 'chinese';
export const DEFAULT_TARGET_LANG = 'english';

// Shared Types
export type Lang = (typeof LANG_VALUES)[number];
export type UserRole = (typeof ROLE_VALUES)[number];
export type NotificationType = (typeof NOTIFICATION_VALUES)[number];
export type ContributorRole = (typeof CONTRIBUTOR_ROLE_VALUES)[number];
export type SuggestionTarget = (typeof SUGGESTION_TARGET_VALUES)[number];
export type SuggestionAction = (typeof SUGGESTION_ACTION_VALUES)[number];
export type SuggestionStatus = (typeof SUGGESTION_STATUS_VALUES)[number];
export type ReviewVerdict = (typeof REVIEW_VERDICT_VALUES)[number];

// Import Preview
export const PREVIEW_LIMIT = 5;
