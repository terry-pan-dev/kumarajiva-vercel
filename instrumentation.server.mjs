import * as Sentry from '@sentry/remix';

Sentry.init({
  dsn: 'https://40cbe12a53fcd5340ef69af77c985db3@o4508454077923328.ingest.us.sentry.io/4508454079627264',
  tracesSampleRate: 1,
  autoInstrumentRemix: true,
});
