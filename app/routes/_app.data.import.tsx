import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { readSutrasAndRolls, getSutra } from '~/services/sutra.service';

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

  try {
    const sutrasWithRolls = await readSutrasAndRolls({ user });
    return json({ sutrasWithRolls, preselectedSutraId: sutraId, preselectedRollId: rollId });
  } catch (error) {
    console.error(error);
    throw new Error('Internal Server Error');
  }
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
  const { sutrasWithRolls, preselectedSutraId = '', preselectedRollId = '' } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto max-w-5xl p-6">
      {/* ── Step 1: Upload Form ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-yellow-600">Import Data</CardTitle>
          <CardDescription className="text-base">
            sutraId = {preselectedSutraId}, rollId = {preselectedRollId}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}