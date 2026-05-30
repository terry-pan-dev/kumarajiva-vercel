import type { LoaderFunctionArgs } from '@remix-run/node';

import { redirect } from '@remix-run/node';
import { useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { Icons } from '~/components/icons';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Separator } from '~/components/ui/separator';
import { useToast } from '~/hooks/use-toast';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  return null;
}

function DownloadGlossaryButton() {
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch('/data/glossary/download');
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'glossary.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Download failed', description: 'Please try again.', variant: 'error' });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button onClick={handleDownload} disabled={isDownloading}>
      {isDownloading ? (
        <Icons.Loader className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Icons.Download className="mr-2 h-4 w-4" />
      )}
      {isDownloading ? 'Preparing download…' : 'Download CSV'}
    </Button>
  );
}

export default function DataGlossary() {
  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-primary text-2xl">Download Glossary</CardTitle>
          <CardDescription className="text-base">Export the full glossary as a CSV file.</CardDescription>
        </CardHeader>
        <CardContent>
          <DownloadGlossaryButton />
        </CardContent>
      </Card>

      <Separator />

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
