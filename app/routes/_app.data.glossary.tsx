import type { LoaderFunctionArgs } from '@remix-run/node';

import { redirect } from '@remix-run/node';

import { assertAuthUser } from '~/auth.server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  return null;
}

export default function DataGlossary() {
  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-primary text-2xl">Import Glossary</CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or XLSX file to bulk-import glossary entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Glossary import coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
