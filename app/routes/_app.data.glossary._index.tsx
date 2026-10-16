import type { LoaderFunctionArgs } from '@remix-run/node';

import { useAbility } from '@casl/react';
import { redirect } from '@remix-run/node';
import { Link } from '@remix-run/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { assertAuthUser } from '~/auth.server';
import { AbilityContext } from '~/authorisation';
import { Icons } from '~/components/icons';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Separator } from '~/components/ui/separator';
import { useToast } from '~/hooks/use-toast';
import { CHUNK_SIZE } from '~/services/glossary.parse';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  return null;
}

function DownloadGlossaryButton({
  format,
  label,
  variant,
}: {
  format: 'csv' | 'xlsx';
  label: string;
  variant?: 'default' | 'secondary';
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation('glossary');

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/data/glossary/download?format=${format}`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'csv' ? 'glossary.csv' : 'glossary.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t('index.downloadFailed'), description: t('index.tryAgain'), variant: 'error' });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button variant={variant} onClick={handleDownload} disabled={isDownloading}>
      {isDownloading ? (
        <Icons.Loader className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Icons.Download className="mr-2 h-4 w-4" />
      )}
      {isDownloading ? t('index.preparingDownload') : label}
    </Button>
  );
}

function ImportGlossaryLink() {
  const { t } = useTranslation('glossary');
  return (
    <div className="flex items-center gap-3">
      <Button asChild>
        <Link to="/data/glossary/import">
          <Icons.Add className="mr-2 h-4 w-4" />
          {t('index.goToImport')}
        </Link>
      </Button>
      <p className="text-muted-foreground text-sm">{t('index.importHint', { chunkSize: CHUNK_SIZE })}</p>
    </div>
  );
}

function ReplaceGlossaryLink() {
  const { t } = useTranslation('glossary');
  return (
    <div className="flex items-center gap-3">
      <Button asChild>
        <Link to="/data/glossary/replace">
          <Icons.Add className="mr-2 h-4 w-4" />
          {t('index.goToReplace')}
        </Link>
      </Button>
      <p className="text-muted-foreground text-sm">{t('index.replaceHint')}</p>
    </div>
  );
}

export default function DataGlossary() {
  // Cosmetic only — each route gates itself server-side. These just avoid offering a card
  // that would redirect on click.
  const ability = useAbility(AbilityContext);
  const canDownload = ability.can('Maintain', 'GlossaryData');
  const canImport = ability.can('Maintain', 'GlossaryData');
  const canReplace = ability.can('Administrate', 'GlossaryData');
  const { t } = useTranslation('glossary');

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      {canDownload && (
        <Card>
          <CardHeader>
            <CardTitle className="text-primary text-2xl">{t('index.downloadTitle')}</CardTitle>
            <CardDescription className="text-base">{t('index.downloadDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <DownloadGlossaryButton format="xlsx" label={t('index.downloadExcel')} />
            <DownloadGlossaryButton format="csv" variant="secondary" label={t('index.downloadCsv')} />
          </CardContent>
        </Card>
      )}

      {canImport && (
        <>
          {canDownload && <Separator />}

          <Card>
            <CardHeader>
              <CardTitle className="text-primary text-2xl">{t('index.importTitle')}</CardTitle>
              <CardDescription className="text-base">{t('index.importDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ImportGlossaryLink />
            </CardContent>
          </Card>
        </>
      )}

      {canReplace && (
        <>
          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="text-primary text-2xl">{t('index.replaceTitle')}</CardTitle>
              <CardDescription className="text-base">{t('index.replaceDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReplaceGlossaryLink />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
