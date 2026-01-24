import { RemixBrowser, useLocation, useMatches } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { startTransition, StrictMode, useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';

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

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>,
  );
});
