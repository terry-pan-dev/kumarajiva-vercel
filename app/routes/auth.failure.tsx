import { Link } from '@remix-run/react';
import { AlertTriangle, ExternalLink, RotateCcw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/components/ui/card';

export default function OAuthLoginFailure({ errorMessage = 'An error occurred during the login process.' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center justify-center text-gray-800">
            <AlertTriangle className="mr-2 h-6 w-6 text-yellow-500" />
            Login Unsuccessful
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-gray-600">
            We encountered an issue while trying to log you in with the third-party service.
          </p>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Details</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
          <div className="border-l-4 border-blue-400 bg-blue-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <ExternalLink className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">This could be due to:</p>
                <ul className="mt-2 list-inside list-disc text-sm text-blue-700">
                  <li>Temporary issues with the login service</li>
                  <li>Network connectivity problems</li>
                  <li>Permissions not granted for the required scopes</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="default">
            <RotateCcw className="mr-2 h-4 w-4" />
            <Link to="/login">Retry Login</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
