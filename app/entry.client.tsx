import { RemixBrowser, useLocation, useMatches } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { startTransition, StrictMode, useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';

import { createI18n, DEFAULT_LOCALE, isLocale } from '~/i18n/config';

process.env.NODE_ENV === 'production' &&
  Sentry.init({
    dsn: 'https://8119ac64bfb23f74d2189f3d5a86e6c4@o4510736651321344.ingest.de.sentry.io/4510767510716496',
    tracesSampleRate: 1,

    integrations: [
      Sentry.browserTracingIntegration({
        useEffect,
        useLocation,
        useMatches,
      }),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    tracePropagationTargets: ['https://btts-kumarajiva.org'],
  });

// Start in the language the server rendered, so hydration matches. Later changes
// come from the root loader (see Layout in root.tsx).
const serverLocale = document.documentElement.lang;
const i18n = createI18n(isLocale(serverLocale) ? serverLocale : DEFAULT_LOCALE);

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <RemixBrowser />
      </I18nextProvider>
    </StrictMode>,
  );
});
