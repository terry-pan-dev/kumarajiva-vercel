// The paragraph search index (Algolia `paragraphs`): its settings and a full rebuild from
// paragraphs_new. Admin-only, and not a routine task — everyday edits, imports and deletes keep
// the index in step on their own. The page says when a rebuild is called for.
//
// The loader is a dry run (rebuildParagraphIndex without `apply`): it reads every row and the
// live index, and writes nothing. The action runs the rebuild itself. Both are the same code as
// `pnpm search:rebuild`, so the page and the script cannot disagree.
//
// One request is enough: on the current data a rebuild is a few thousand small records. The
// budget below leaves room for the index to grow well past that.
import { Form, useActionData, useLoaderData, useNavigation, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { ErrorInfo } from '~/components/ErrorInfo';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { useToast } from '~/hooks/use-toast';
import { getFixedT } from '~/i18n/locale.server';
import { PARAGRAPH_INDEX, PARAGRAPH_INDEX_SETTINGS, type ParagraphIndexSetting } from '~/services/paragraph.record';
import { rebuildParagraphIndex } from '~/services/search.server';

export const config = {
  maxDuration: 300,
};

export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
}

// Needs Administrate, like the Document Inspector. The sidebar hides the link; this is the gate
// that actually holds, for the loader and the action alike.
async function assertAdmin(request: Request) {
  const user = await assertAuthUser(request);
  if (!user) throw redirect('/login');
  if (defineAbilityFor(user).cannot('Administrate', 'TranslationData')) throw redirect('/data');
  return user;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await assertAdmin(request);
  const report = await rebuildParagraphIndex({ apply: false });
  return json({ report, indexName: PARAGRAPH_INDEX, configured: PARAGRAPH_INDEX_SETTINGS });
}

export async function action({ request }: ActionFunctionArgs) {
  await assertAdmin(request);
  const t = await getFixedT(request);
  const formData = await request.formData();
  if (formData.get('intent') !== 'rebuild') {
    return json({ success: false as const, message: t('data:rawData.unknownAction') }, { status: 400 });
  }
  try {
    const result = await rebuildParagraphIndex({ apply: true });
    return json({
      success: true as const,
      message: t('data:searchIndex.rebuilt', { count: result.records, settings: result.settingsChanged.length }),
    });
  } catch (error) {
    console.error('Paragraph index rebuild failed:', error);
    const detail = error instanceof Error ? error.message : String(error);
    return json({ success: false as const, message: t('data:searchIndex.rebuildFailed', { error: detail }) }, 500);
  }
}

// Which explanation goes with each setting. Typed against the settings, so adding one to
// PARAGRAPH_INDEX_SETTINGS without explaining it here fails the type check.
const SETTING_HELP = {
  searchableAttributes: 'searchIndex.settings.help.searchableAttributes',
  typoTolerance: 'searchIndex.settings.help.typoTolerance',
  advancedSyntax: 'searchIndex.settings.help.advancedSyntax',
} as const satisfies Record<ParagraphIndexSetting, string>;

const MONO = 'font-mono text-xs';
const SAMPLE = 20;

const show = (value: unknown) => (value === undefined ? null : JSON.stringify(value));

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted rounded p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-foreground text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function IdList({ title, ids }: { title: string; ids: string[] }) {
  const { t } = useTranslation('data');
  if (ids.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className={`${MONO} mt-1 space-y-0.5`}>
          {ids.slice(0, SAMPLE).map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
        {ids.length > SAMPLE && (
          <div className="mt-1 text-xs">{t('searchIndex.report.andMore', { count: ids.length - SAMPLE })}</div>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default function SearchIndexPage() {
  const { report, indexName, configured } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { toast } = useToast();
  const { t } = useTranslation(['data', 'common']);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rebuilding = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'rebuild';

  useEffect(() => {
    if (!actionData) return;
    setConfirmOpen(false);
    toast({
      variant: actionData.success ? 'default' : 'error',
      title: actionData.success ? t('common:toast.done') : t('common:toast.oops'),
      description: actionData.message,
      position: 'top-right',
    });
  }, [actionData, toast, t]);

  const settingKeys = Object.keys(configured) as ParagraphIndexSetting[];
  const inStep =
    report.recordsBefore === report.records &&
    report.settingsChanged.length === 0 &&
    report.withoutSearchId.length === 0 &&
    report.duplicateSearchId.length === 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <Alert className="border-yellow-600 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-700" />
          <AlertTitle className="text-yellow-900">{t('searchIndex.warning.title')}</AlertTitle>
          <AlertDescription className="space-y-2 text-yellow-900">
            <p>{t('searchIndex.warning.routine')}</p>
            <p>{t('searchIndex.warning.when')}</p>
            <ul className="list-disc pl-5">
              <li>{t('searchIndex.warning.whenOutside')}</li>
              <li>{t('searchIndex.warning.whenSyncFailed')}</li>
              <li>{t('searchIndex.warning.whenCodeChanged')}</li>
            </ul>
            <p>{t('searchIndex.warning.editing')}</p>
            <p>
              {t('searchIndex.warning.script')} <code className={MONO}>pnpm search:rebuild --apply</code>
            </p>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-lg">
              {t('searchIndex.report.title')} <span className={`${MONO} text-muted-foreground`}>{indexName}</span>
            </CardTitle>
            <Badge variant={inStep ? 'secondary' : 'destructive'}>
              {t(inStep ? 'searchIndex.report.inStep' : 'searchIndex.report.drifted')}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">{t('searchIndex.report.description')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Stat value={report.rows} label={t('searchIndex.report.rows')} />
              <Stat value={report.recordsBefore} label={t('searchIndex.report.recordsBefore')} />
              <Stat value={report.records} label={t('searchIndex.report.recordsAfter')} />
            </div>
            <IdList
              ids={report.withoutSearchId}
              title={t('searchIndex.report.withoutSearchId', { count: report.withoutSearchId.length })}
            />
            <IdList
              ids={report.duplicateSearchId.map((d) => `${d.id} (${d.searchId})`)}
              title={t('searchIndex.report.duplicateSearchId', { count: report.duplicateSearchId.length })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('searchIndex.settings.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              {t('searchIndex.settings.description')} <code className={MONO}>app/services/paragraph.record.ts</code>
            </p>
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-muted text-xs">
                <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
                  <th className="w-1/2">{t('searchIndex.settings.setting')}</th>
                  <th>{t('searchIndex.settings.configured')}</th>
                  <th>{t('searchIndex.settings.live')}</th>
                </tr>
              </thead>
              <tbody>
                {settingKeys.map((key) => {
                  const differs = report.settingsChanged.includes(key);
                  const live = show(report.liveSettings[key]);
                  return (
                    <tr key={key} className="border-border border-t align-top [&>td]:px-2 [&>td]:py-2">
                      <td>
                        <div className={`${MONO} font-semibold`}>{key}</div>
                        <div className="text-muted-foreground mt-1 text-xs">{t(SETTING_HELP[key])}</div>
                      </td>
                      <td className={`${MONO} break-words`}>{show(configured[key])}</td>
                      <td className={`${MONO} break-words`}>
                        <span className={differs ? 'font-semibold text-red-600' : ''}>
                          {live ?? t('searchIndex.settings.unset')}
                        </span>
                        {differs && (
                          <div className="mt-1">
                            <Badge variant="destructive">{t('searchIndex.settings.differs')}</Badge>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button disabled={rebuilding} onClick={() => setConfirmOpen(true)}>
            {rebuilding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            {t(rebuilding ? 'searchIndex.rebuilding' : 'searchIndex.rebuild')}
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => !rebuilding && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('searchIndex.confirm.title')}</DialogTitle>
            <DialogDescription>
              {t('searchIndex.confirm.description', { index: indexName, count: report.records })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={rebuilding}>
                {t('common:actions.cancel')}
              </Button>
            </DialogClose>
            <Form method="post">
              <input type="hidden" name="intent" value="rebuild" />
              <Button type="submit" variant="destructive" disabled={rebuilding}>
                {rebuilding && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {t('searchIndex.rebuild')}
              </Button>
            </Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
