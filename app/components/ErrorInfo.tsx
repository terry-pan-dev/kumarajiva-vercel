import { isRouteErrorResponse, Link } from '@remix-run/react';
import { AlertTriangle, Bug } from 'lucide-react';
import { Icons } from './icons';

interface ErrorBoundaryProps {
  error: unknown;
}

export const ErrorInfo = ({ error }: ErrorBoundaryProps) => {
  let errorHeading = 'Oops! Something went wrong';
  let errorMessage = 'An unexpected error occurred. Please try again later.';
  let errorStatusCode = 500;

  if (isRouteErrorResponse(error)) {
    errorHeading = `${error.status} ${error.statusText}`;
    errorMessage = error.data;
    errorStatusCode = error.status;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <div className="mb-4 flex grow flex-col items-center justify-center rounded-lg bg-gray-100 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
        {errorStatusCode === 404 ? (
          <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-yellow-500" />
        ) : (
          <Bug className="mx-auto mb-4 h-16 w-16 text-red-500" />
        )}
        <h1 className="mb-2 text-3xl font-bold">{errorHeading}</h1>
        <p className="mb-6 text-gray-600">{errorMessage}</p>
        <div className="flex justify-center space-x-4">
          <Link
            to="/"
            className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <Icons.home className="mr-2 h-4 w-4" /> Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <Icons.arrowLeft className="mr-2 h-4 w-4" /> Go Back
          </button>
        </div>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
          <h2 className="mb-2 text-xl font-semibold">Debug Information</h2>
          <pre className="overflow-auto rounded bg-gray-100 p-4 text-sm">{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
