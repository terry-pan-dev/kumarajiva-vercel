// One section of a project as working document cards: each source paragraph's
// number and excerpts of its aligned texts. Loaded when a section is opened on
// the working document page. Failures are returned as data rather than thrown:
// a thrown response from a fetcher would replace the whole page with its error
// boundary.
import { json, type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { getProjectWithReferences } from '~/services/project.service';
import { readWorkingDocumentCards, type WorkingDocumentCard } from '~/services/workingDocument.export';

type CardsResponse = { error: string | null; cards: WorkingDocumentCard[] };

const failure = (error: string, status: number) => json<CardsResponse>({ error, cards: [] }, { status });

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return failure('Please sign in again.', 401);
  if (defineAbilityFor(user).cannot('Maintain', 'Translation')) {
    return failure('You are not allowed to export working documents.', 403);
  }

  const project = params.projectId ? await getProjectWithReferences(params.projectId) : undefined;
  if (!project) return failure('Project not found.', 404);

  try {
    const cards = await readWorkingDocumentCards({
      sectionId: params.sectionId ?? '',
      sourceDocumentId: project.sourceDocumentId,
      targetDocumentId: project.targetDocumentId,
      references: project.references,
    });
    return json<CardsResponse>({ error: null, cards });
  } catch (error) {
    return failure((error as Error).message, 400);
  }
};
