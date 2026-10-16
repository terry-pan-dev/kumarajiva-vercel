import { useFetcher } from '@remix-run/react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '~/i18n/config';
import { cn } from '~/lib/utils';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const fetcher = useFetcher();
  const current = i18n.language as Locale;

  return (
    <fetcher.Form
      method="post"
      action="/locale"
      aria-label={t('locale.label')}
      className="flex items-center gap-1 text-sm font-normal"
    >
      <Languages size={16} aria-hidden className="text-muted-foreground" />
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="submit"
          name="locale"
          lang={locale}
          value={locale}
          aria-pressed={locale === current}
          disabled={fetcher.state !== 'idle'}
          className={cn(
            'rounded px-2 py-1 transition',
            locale === current ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </fetcher.Form>
  );
}
