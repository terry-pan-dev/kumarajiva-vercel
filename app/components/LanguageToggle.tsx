import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '~/i18n/config';
import { writeLocaleCookie } from '~/i18n/locale';
import { cn } from '~/lib/utils';

// Switches in place: every locale is already bundled, so this changes the language in the
// browser and remembers it in the cookie for the server. No request is made, so no loader
// re-runs. Text the server already sent (a toast, an import result) stays as it was; the
// next action answers in the new language.
export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const current = i18n.language as Locale;

  const choose = (locale: Locale) => {
    if (locale === current) return;
    writeLocaleCookie(locale);
    i18n.changeLanguage(locale);
  };

  return (
    <div role="group" aria-label={t('locale.label')} className="flex items-center gap-1 text-sm font-normal">
      <Languages size={16} aria-hidden className="text-muted-foreground" />
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          onClick={() => choose(locale)}
          aria-pressed={locale === current}
          className={cn(
            'rounded px-2 py-1 transition',
            locale === current ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
