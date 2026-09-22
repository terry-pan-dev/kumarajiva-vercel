// The write side of the Glossary Inspector, as a resource route the page calls one step at a
// time with plain fetch.
//
// It is separate from the inspector page for two reasons, both about being able to show
// progress. A long job has to be cut into short requests for the page to have anything to
// report between "started" and "finished", and a request per page of work only reads as
// progress if the page can drive the loop itself — with fetch and an AbortController it can,
// including stopping halfway. And because these are not Remix fetcher submissions, the
// inspector's loader is not revalidated after every step; that loader browses the whole search
// index, so a re-index of thirty pages would otherwise trigger thirty full rescans. The page
// revalidates once, deliberately, when a job that changed the counts finishes.
//
// Nothing here is new authority: the first three operations were previously intents on the
// inspector's own action. The two trash operations sit beside
// them for the same reason — a bulk restore or purge is a loop of chunks with a bar.
import { json, redirect, type ActionFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { REMOVABLE_RECORD_CLASSES, type RemovableRecordClass } from '~/services/glossary.analyse';
import { deleteIndexRecords, findRemovableIndexRecords } from '~/services/glossary.inspect';
import { purgeTrashedGlossaries, reindexGlossaryPage, restoreTrashedGlossaries } from '~/services/glossary.service';

// cleanup-scan browses every record in the index — on the order of 30k records and 20s on the
// current glossary — so this route needs more than the default function budget. The other two
// intents are bounded to one page of work each and are nowhere near it.
export const config = {
  maxDuration: 300,
};

// What one step of each job returns. The page picks the step it is running by key, so adding
// an intent here is what makes it callable and typed on the other side.
export type JobPayloads = {
  'reindex-page': { indexed: number; repointed: number; nextAfterId: string | null };
  'cleanup-scan': { objectIDs: string[]; scanned: number };
  'delete-records': { deleted: number; skipped: { objectID: string; reason: string }[] };
  // skipped: ids that were not in the trash any more — restored or purged since the page loaded.
  'restore-trash': { done: number; skipped: number };
  'purge-trash': { done: number; skipped: number };
};

export type JobResponse = ({ ok: true } & JobPayloads[keyof JobPayloads]) | { ok: false; message: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const ability = defineAbilityFor(user);
  const formData = await request.formData();
  const intent = formData.get('intent');

  // Each intent asks for the level of what it does. Re-indexing only rewrites what the table
  // already says, and restoring undoes a soft delete, so both need Maintain. Scanning the whole
  // index, deleting index records and purging the trash are Administrate — the last two cannot
  // be undone.
  const needed = intent === 'reindex-page' || intent === 'restore-trash' ? 'Maintain' : 'Administrate';
  if (ability.cannot(needed, 'GlossaryData')) {
    return json<JobResponse>({ ok: false, message: 'You are not authorised to change search records.' }, 403);
  }

  if (intent === 'reindex-page') {
    // Absent on the first call, then the id the previous page ended at.
    const afterId = formData.get('afterId') ? String(formData.get('afterId')) : null;
    try {
      const page = await reindexGlossaryPage({ afterId });
      return json<JobResponse>({ ok: true, ...page });
    } catch (error) {
      console.error('Error re-indexing a glossary page:', error);
      const message = error instanceof Error ? error.message : 'Failed to re-index the glossary.';
      return json<JobResponse>({ ok: false, message }, 500);
    }
  }

  if (intent === 'cleanup-scan') {
    const recordClass = String(formData.get('recordClass')) as RemovableRecordClass;
    if (!REMOVABLE_RECORD_CLASSES.includes(recordClass)) {
      return json<JobResponse>({ ok: false, message: 'Unknown record class.' }, 400);
    }
    try {
      const { objectIDs, scanned } = await findRemovableIndexRecords(recordClass);
      return json<JobResponse>({ ok: true, objectIDs, scanned });
    } catch (error) {
      console.error('Error scanning for removable glossary index records:', error);
      const message = error instanceof Error ? error.message : 'Failed to scan the search index.';
      return json<JobResponse>({ ok: false, message }, 500);
    }
  }

  if (intent === 'delete-records') {
    const objectIds = formData.getAll('objectId').map(String);
    if (objectIds.length === 0) {
      return json<JobResponse>({ ok: false, message: 'No records selected.' }, 400);
    }
    try {
      // Re-derives per record whether the delete is safe, so ids that came back from the
      // browser — the cleanup's scan results — are checked again before anything is removed.
      const { deleted, skipped } = await deleteIndexRecords(objectIds);
      return json<JobResponse>({ ok: true, deleted: deleted.length, skipped });
    } catch (error) {
      console.error('Error deleting glossary index records:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete search records.';
      return json<JobResponse>({ ok: false, message }, 500);
    }
  }

  if (intent === 'restore-trash' || intent === 'purge-trash') {
    const ids = formData.getAll('glossaryId').map(String);
    if (ids.length === 0) {
      return json<JobResponse>({ ok: false, message: 'No entries selected.' }, 400);
    }
    try {
      // Both act only on ids that are still in the trash, so a stale page cannot purge an entry
      // someone has restored in the meantime.
      const result =
        intent === 'restore-trash' ? await restoreTrashedGlossaries(ids) : await purgeTrashedGlossaries(ids);
      return json<JobResponse>({ ok: true, ...result });
    } catch (error) {
      console.error(`Error running ${intent}:`, error);
      const message = error instanceof Error ? error.message : 'Failed to update the trash.';
      return json<JobResponse>({ ok: false, message }, 500);
    }
  }

  return json<JobResponse>({ ok: false, message: 'Unknown action.' }, 400);
};
