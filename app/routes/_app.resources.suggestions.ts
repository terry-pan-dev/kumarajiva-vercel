// The glossary suggestion endpoint (docs/plans/glossary-suggestions.md). POST a JSON body
// { intent: 'submit', ...submitRequestSchema } to suggest a new term, a new translation, an edit
// or a flag. Anyone signed in may submit; the service holds every other rule.
//
// Answers { success: true, suggestion: { id } }, or { success: false, code, message } with the
// SuggestionError's code (and `glossaryId` for 'term-exists', `fields` for 'stale').
import { json, redirect, type ActionFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '~/auth.server';
import { SuggestionError, type SuggestionErrorCode } from '~/services/suggestion.rules';
import { submitSuggestion } from '~/services/suggestion.service';
import { submitRequestSchema } from '~/validations/suggestion.validation';

const STATUS: Record<SuggestionErrorCode, number> = {
  forbidden: 403,
  'not-found': 404,
  invalid: 400,
  'wrong-kind': 400,
  'nothing-changed': 400,
  'not-pending': 409,
  locked: 409,
  'target-gone': 409,
  'term-exists': 409,
  stale: 409,
  'last-translation': 409,
};

// Not exported: a route module's exports other than action/loader stay in the client bundle.
const suggestionErrorResponse = (error: SuggestionError) =>
  json(
    { success: false, code: error.code, message: error.message, glossaryId: error.glossaryId, fields: error.fields },
    { status: STATUS[error.code] },
  );

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
  if (intent !== 'submit') {
    return json({ success: false, code: 'invalid', message: 'Unknown request.' }, { status: 400 });
  }
  const parsed = submitRequestSchema.safeParse(rest);
  if (!parsed.success) {
    return json({ success: false, code: 'invalid', message: 'Invalid suggestion.' }, { status: 400 });
  }

  try {
    const suggestion = await submitSuggestion(user, parsed.data);
    return json({ success: true, suggestion: { id: suggestion.id } });
  } catch (error) {
    if (error instanceof SuggestionError) return suggestionErrorResponse(error);
    throw error;
  }
};
