import { Links, Meta, Outlet, Scripts, ScrollRestoration, type MetaFunction, useRouteError } from '@remix-run/react';
import { captureRemixErrorBoundaryError, withSentry } from '@sentry/remix';

import './tailwind.css';

import { Analytics } from '@vercel/analytics/react';
import { type LinksFunction } from '@vercel/remix';

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

export function Layout() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
