import type { EntryContext } from '@remix-run/node';

import { RemixServer } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { waitUntil } from '@vercel/functions';
import { handleRequest } from '@vercel/remix';

// Initialize Sentry for both production and Vercel preview deployments
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: 'https://40cbe12a53fcd5340ef69af77c985db3@o4508454077923328.ingest.us.sentry.io/4508454079627264',
    tracesSampleRate: 1,
    autoInstrumentRemix: true,
    // Enable trace propagation for your domain
    tracePropagationTargets: ['https://btts-kumarajiva.org'],
    // Enable detailed debugging for Vercel
    sendDefaultPii: true,
    debug: process.env.NODE_ENV !== 'production',
  });
}

export default function (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  let remixServer = <RemixServer url={request.url} context={remixContext} />;
  return handleRequest(request, responseStatusCode, responseHeaders, remixServer);
}

export const handleError = Sentry.wrapHandleErrorWithSentry((error, { request }) => {
  waitUntil(Sentry.flush());
});
