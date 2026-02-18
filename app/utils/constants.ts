// The raw arrays (Source of Truth)
export const LANG_VALUES = ['chinese', 'english', 'sanskrit', 'indonesian'] as const;
export const ROLE_VALUES = ['admin', 'leader', 'editor', 'reader', 'assistant', 'manager'] as const;
export const NOTIFICATION_VALUES = ['info', 'error', 'success', 'warning'] as const;

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
