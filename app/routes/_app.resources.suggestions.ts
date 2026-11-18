// The glossary suggestion endpoint (docs/plans/glossary-suggestions.md).
//
// GET ?glossaryId=<uuid>: the entry's pending suggestions as the signed-in user sees them
// ({ glossaryId, suggestions: PendingSuggestionView[] }), for the glossary card.
//
// POST a JSON body:
// - { intent: 'submit', ...submitRequestSchema } to suggest a new term, a new translation, an
//   edit or a flag. Anyone signed in may submit.
// - { intent: 'edit-own', id, proposed?, note? } or { intent: 'withdraw', id }: the submitter's
//   own pending suggestion.
// The service holds every other rule.
//
// Answers { success: true, suggestion: { id } }, or { success: false, code, message } with the
// SuggestionError's code (and `glossaryId` for 'term-exists', `fields` for 'stale').
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { z } from 'zod';

import { assertAuthUser } from '~/auth.server';
import { SUGGESTION_ERROR_STATUS, SuggestionError } from '~/services/suggestion.rules';
import {
  editOwnSuggestion,
  readPendingSuggestionViews,
  submitSuggestion,
  withdrawSuggestion,
} from '~/services/suggestion.service';
import { ownRequestSchema, submitRequestSchema } from '~/validations/suggestion.validation';

// Not exported: a route module's exports other than action/loader stay in the client bundle.
const suggestionErrorResponse = (error: SuggestionError) =>
  json(
    { success: false, code: error.code, message: error.message, glossaryId: error.glossaryId, fields: error.fields },
    { status: SUGGESTION_ERROR_STATUS[error.code] },
  );

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  const glossaryId = z.string().uuid().safeParse(new URL(request.url).searchParams.get('glossaryId'));
  if (!glossaryId.success) {
    return json({ success: false, code: 'invalid', message: 'Expected a glossaryId.' }, { status: 400 });
  }
  const suggestions = await readPendingSuggestionViews(user, glossaryId.data);
  return json({ success: true, glossaryId: glossaryId.data, suggestions });
};

const invalid = (message: string) => json({ success: false, code: 'invalid', message }, { status: 400 });

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, code: 'invalid', message: 'Expected a JSON body.' }, { status: 400 });
  }
  const { intent, ...rest } = (body ?? {}) as { intent?: unknown };

  try {
    if (intent === 'submit') {
      const parsed = submitRequestSchema.safeParse(rest);
      if (!parsed.success) return invalid('Invalid suggestion.');
      const suggestion = await submitSuggestion(user, parsed.data);
      return json({ success: true, suggestion: { id: suggestion.id } });
    }
    if (intent === 'edit-own' || intent === 'withdraw') {
      const parsed = ownRequestSchema.safeParse(rest);
      if (!parsed.success) return invalid('Invalid request.');
      const { id, proposed, note } = parsed.data;
      const suggestion =
        intent === 'withdraw'
          ? await withdrawSuggestion(user, id)
          : await editOwnSuggestion(user, id, { proposed, note });
      return json({ success: true, suggestion: { id: suggestion.id } });
    }
    return invalid('Unknown request.');
  } catch (error) {
    if (error instanceof SuggestionError) return suggestionErrorResponse(error);
    throw error;
  }
};
