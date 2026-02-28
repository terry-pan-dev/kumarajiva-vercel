import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';
import { useState } from 'react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { getExistingDataPreviewForRollId } from '~/services/file.server';
import { getRoll } from '~/services/roll.service';
import { getSutra } from '~/services/sutra.service';
import { DEFAULT_ORIGIN_LANG, DEFAULT_TARGET_LANG } from '~/utils/constants';

import { assertAuthUser } from '../auth.server';

// ─── Loader ─────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }

  const url = new URL(request.url);
  const sutraId = url.searchParams.get('sutraId');
  const rollId = url.searchParams.get('rollId');

  if (!sutraId || !rollId) return redirect('/data');

  const [sutra, roll, existing] = await Promise.all([
    getSutra(sutraId),
    getRoll(rollId),
    getExistingDataPreviewForRollId(rollId),
  ]);

  if (!sutra || !roll) return redirect('/data');

  return json({
    sutraId,
    rollId,
    sutraName: sutra.title,
    rollName: roll.title,
    originalLanguage: DEFAULT_ORIGIN_LANG,
    translationLanguage: DEFAULT_TARGET_LANG,
    existing,
    userId: user.id,
  });
}

// ─── Action ─────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DataImport() {
  const { sutraId, rollId, sutraName, rollName, originalLanguage, translationLanguage } =
    useLoaderData<typeof loader>();

  const [fileName, setFileName] = useState<string>('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileName(file ? file.name : '');
  };

  return (
    <div className="container mx-auto max-w-5xl p-6">
      {/* ── Step 1: Upload Form ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-yellow-600">Import Data</CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or XLSX file with columns: <strong>origin</strong>, <strong>translation</strong> (optional).
            This will replace all existing data for the selected roll.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ── Sutra / Roll / Language context ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sutra</p>
              <p className="text-base font-semibold text-foreground">{sutraName}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Roll</p>
              <p className="text-base font-semibold text-foreground">{rollName}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Origin Language</p>
              <p className="text-base font-semibold text-foreground">{originalLanguage}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Translation Language
              </p>
              <p className="text-base font-semibold text-foreground">{translationLanguage}</p>
            </div>
          </div>

          {/* ── File upload form ── */}
          <Form method="post" className="space-y-4" encType="multipart/form-data">
            <input type="hidden" name="intent" value="preview" />
            <input type="hidden" name="sutraId" value={sutraId} />
            <input type="hidden" name="rollId" value={rollId} />
            <input type="hidden" name="sutraName" value={sutraName} />
            <input type="hidden" name="originalLanguage" value={originalLanguage} />
            <input type="hidden" name="translationLanguage" value={translationLanguage} />

            <div className="space-y-2">
              <Label htmlFor="file" className="text-lg text-yellow-600">
                Data File *
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  required
                  id="file"
                  name="file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="flex-1 text-base"
                />
              </div>
              <div>
                {fileName && (
                  <p>
                    <span className="text-lg text-muted-foreground">Selected: </span>
                    <span className="text-base font-semibold text-foreground">{fileName}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button asChild type="button" variant="outline" className="text-base text-muted-foreground">
                <a href="/data">Cancel</a>
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
