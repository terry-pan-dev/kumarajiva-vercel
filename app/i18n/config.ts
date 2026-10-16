import { createInstance, type i18n, type TFunction } from 'i18next';

import enCommon from '~/locales/en/common.json';
import enData from '~/locales/en/data.json';
import enGlossary from '~/locales/en/glossary.json';
import zhHantCommon from '~/locales/zh-Hant/common.json';
import zhHantData from '~/locales/zh-Hant/data.json';
import zhHantGlossary from '~/locales/zh-Hant/glossary.json';

// UI language only. This is unrelated to a user's originLang/targetLang, which
// describe the translation pair they work on, not the language they read the UI in.
export const SUPPORTED_LOCALES = ['en', 'zh-Hant'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

// Each locale is named in its own language, so these are not translated.
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'zh-Hant': '繁體中文',
};

export const isLocale = (value: unknown): value is Locale => SUPPORTED_LOCALES.includes(value as Locale);

// The translations are small enough to bundle, so every instance initialises
// synchronously and the server render already has the right strings.
export const resources = {
  en: { common: enCommon, data: enData, glossary: enGlossary },
  'zh-Hant': { common: zhHantCommon, data: zhHantData, glossary: zhHantGlossary },
} as const;

export const NAMESPACES = ['common', 'data', 'glossary'] as const;
type Namespaces = typeof NAMESPACES;

// Unprefixed keys resolve in `common`; other namespaces are addressed as `data:...`.
export type AppTFunction = TFunction<Namespaces>;

export function createI18n(locale: Locale): i18n {
  const instance = createInstance();
  instance.init({
    lng: locale,
    resources,
    ns: [...NAMESPACES],
    defaultNS: 'common',
    // A key missing in zh-Hant shows the English string, so pages can be
    // translated one at a time.
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    interpolation: { escapeValue: false }, // React already escapes
    initAsync: false,
  });
  return instance;
}

// One fixed-language instance per locale, for code that cannot use hooks: route
// `meta` functions and actions. They never change language, so sharing them
// across requests is safe.
const fixedInstances = new Map<Locale, i18n>();

export function translator(locale: Locale): AppTFunction {
  let instance = fixedInstances.get(locale);
  if (!instance) {
    instance = createI18n(locale);
    fixedInstances.set(locale, instance);
  }
  return instance.getFixedT(locale, [...NAMESPACES]) as AppTFunction;
}
