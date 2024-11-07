import { Link } from '@remix-run/react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/components/ui/card';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-3xl font-extrabold text-gray-900">404</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-xl text-gray-600">Oops! Page not found</p>
          <p className="text-center text-gray-500">
            The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
          </p>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="default" asChild>
            <Link to="/" className="inline-flex items-center">
              <Home className="mr-2 h-4 w-4" />
              Go to Homepage
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
