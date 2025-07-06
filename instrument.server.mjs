import * as Sentry from '@sentry/remix';

// Initialize Sentry for both production and Vercel preview deployments
if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) {
  Sentry.init({
    dsn: 'https://40cbe12a53fcd5340ef69af77c985db3@o4508454077923328.ingest.us.sentry.io/4508454079627264',
    tracesSampleRate: 1.0,
    autoInstrumentRemix: true,
    // Enable trace propagation for your domain
    tracePropagationTargets: ['https://btts-kumarajiva.org'],
    // Enable detailed debugging for Vercel
    sendDefaultPii: true,
    debug: process.env.NODE_ENV !== 'production',
  });
}
