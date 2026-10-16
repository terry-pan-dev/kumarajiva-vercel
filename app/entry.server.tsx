import type { EntryContext } from '@remix-run/node';

import { RemixServer } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { waitUntil } from '@vercel/functions';
import { handleRequest } from '@vercel/remix';
import { I18nextProvider } from 'react-i18next';

import { createI18n } from '~/i18n/config';
import { getLocale } from '~/i18n/locale.server';

// Initialize Sentry for both production and Vercel preview deployments
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: 'https://8119ac64bfb23f74d2189f3d5a86e6c4@o4510736651321344.ingest.de.sentry.io/4510767510716496',
    tracesSampleRate: 1,
    autoInstrumentRemix: true,
    // Enable trace propagation for your domain
    tracePropagationTargets: ['https://btts-kumarajiva.org'],
    // Enable detailed debugging for Vercel
    sendDefaultPii: true,
    debug: process.env.NODE_ENV !== 'production',
  });
}

export default async function (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  // A fresh instance per request, so concurrent renders in different languages can't interfere.
  const i18n = createI18n(await getLocale(request));
  let remixServer = (
    <I18nextProvider i18n={i18n}>
      <RemixServer url={request.url} context={remixContext} />
    </I18nextProvider>
  );
  return handleRequest(request, responseStatusCode, responseHeaders, remixServer);
}

export const handleError = Sentry.wrapHandleErrorWithSentry((error, { request }) => {
  waitUntil(Sentry.flush());
});
