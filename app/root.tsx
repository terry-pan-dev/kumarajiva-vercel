import {
  json,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type MetaFunction,
  useRouteError,
} from '@remix-run/react';
import { captureRemixErrorBoundaryError, withSentry } from '@sentry/remix';
import { Analytics } from '@vercel/analytics/react';
import { type LinksFunction, type LoaderFunctionArgs } from '@vercel/remix';

import './tailwind.css';

import { useTranslation } from 'react-i18next';

import { getLocale } from '~/i18n/locale.server';

export const links: LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
];

export const meta: MetaFunction = () => [
  {
    charset: 'utf-8',
  },
  {
    title: 'Kumarajiva',
  },
  {
    viewport: 'width=device-width,initial-scale=1',
  },
];

// Applies the saved font preference (see FontSizePreference in settings) before the
// first paint, so pages don't render at the default size and then jump. It sets an
// inline style on <html>, hence suppressHydrationWarning there.
const fontSizeScript = `try {
  var size = JSON.parse(localStorage.getItem('fontPreference'));
  if (typeof size === 'number' && size >= 12 && size <= 24) {
    document.documentElement.style.setProperty('--font-size', size + 'px');
  }
} catch (e) {}`;

// The request's locale, for meta functions (see pageLocale). Components read the language
// from the i18n instance instead: the toggle switches it in the browser without reloading
// this data, so after a switch this value is stale until the next full load.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ locale: getLocale(request) });
};

export function Layout() {
  // The i18n instance is the source of truth for the language: the server's is created for
  // this request's locale, and the browser's follows the toggle. useTranslation re-renders
  // this on a switch, which keeps <html lang> current.
  const { i18n } = useTranslation();

  return (
    <html lang={i18n.language} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: fontSizeScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        <script src="https://cdn.jsdelivr.net/npm/smoothscroll-polyfill@0.4.4/dist/smoothscroll.min.js" />
        <Analytics mode="production" />
      </body>
    </html>
  );
}

export const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};

function App() {
  return <Outlet />;
}

export default withSentry(App);
