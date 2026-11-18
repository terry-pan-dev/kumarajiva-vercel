# Glossary suggestions: edits become reviewed submissions

Written 2026-11-17. **Design agreed with the user. The schema below was approved by the user on
2026-11-17.** Steps 0 and 1 are done (working tree, 2026-11-17). Migration 0030 is **not yet
applied** to the shared dev database: that waits for the user. Steps 2+ are not started.

## Why

The glossary forms ask for a full entry, but people adding a term while translating rarely have
more than the term, a rendering and a thought about it. We want those additions anyway, and we
want to see them, so the data can be brought up to standard afterwards. So the everyday glossary
stops editing the glossary directly: every change from it is a **suggestion**, which shows in
the glossary at once, marked as under review, until an admin finalizes it.

## Decisions (user, 2026-11-17)

- **Anyone signed in can suggest**, readers included. Suggesting needs no permission level.
- **Tech and admin enrich**: they fill in a suggestion's missing fields. Managers are for
  translations and only suggest, like everyone else.
- **Leaders review** from the glossary page: "looks right" or "needs work", with a note. They
  are short on time, so reviewing is optional and happens on the card itself.
- **Admins finalize**: accept, reject, dismiss a flag. An admin may finalize something no leader
  has reviewed.
- **No direct path for leaders**, not even for urgent needs: they suggest like everyone.
- **Direct edits stay direct in Data Management** for tech and admin (typo fixes and so on):
  trust, not review. Their existing `updated_by` / `updated_at` stamps are the record.
- **Everyone sees pending suggestions.**
- **"Ready for review"** is a mark enrichers can set. It is information only, never required.
- **People can edit or withdraw their own suggestions** while pending.
- **The submitter's note stays on the suggestion**, as review history. It is never merged into
  the translation's `discussion`, which may already hold text.
- **No delete suggestions.** You flag a translation as wrong, with a note.
- **Translation paragraphs may get suggestions later.** The table must allow it.

## Roles and permissions

| Role | Suggest, flag, withdraw own | Enrich, mark ready | Review | Finalize | Direct edit (Data Management) |
|---|---|---|---|---|---|
| admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| tech | ✓ | ✓ | | | ✓ |
| leader | ✓ | | ✓ | | |
| manager, editor, assistant, reader | ✓ | | | | |

No new permission subject. The existing ones map onto the jobs:

- **Enrich = GlossaryData Maintain** (tech, admin). It takes the same trust as a direct edit.
- **Review = Glossary Update** (leader, admin).
- **Finalize = Glossary Administrate** (admin).
- **Glossary Maintain is retired.** `LEVELS` in `app/authorisation/ability.ts` changes:
  - leader: Glossary `Maintain` → `Update`
  - tech: drops Glossary (keeps GlossaryData `Maintain`)
  - manager and editor: drop Glossary `Update`
  - The header comment gains a line: on Glossary, Update means review and Administrate means
    finalize.
- Manager keeps TranslationData only. They don't need GlossaryData.

**Ship the permission change together with the suggestion UI, not before.** Otherwise editors
lose their edit button before they have a suggest button.

## Kinds of suggestion

| `target_kind` | `action` | Means | Targets |
|---|---|---|---|
| `glossary_term` | `create` | a new term, with its first translation | nothing yet |
| `glossary_translation` | `create` | a new translation on an existing term | `glossary_id` |
| `glossary_translation` | `edit` | changed fields of a translation | `glossary_id`, `translation_id` |
| `glossary_translation` | `flag` | "this is wrong", a note and no values | `glossary_id`, `translation_id` |

Later: `paragraph` + `edit` (proposed translation text), and possibly `flag`.

## Lifecycle

```
pending ──(enrich, mark ready, review: any order, all optional)──┬─ accepted
   │                                                              ├─ rejected
   └─ withdrawn (by the submitter)                                └─ dismissed (flags)
```

- **Only `pending` can change.** Accepted, rejected, withdrawn and dismissed suggestions are
  history and are never edited.
- **The submitter edits** the proposal and note until someone has enriched or reviewed it. After
  that they can still withdraw it. *(Suggested rule. Confirm when building.)*
- **Enriching** overwrites `proposed` and stamps `enriched_by` / `enriched_at`. `submitted`
  never changes, so history shows what the submitter wrote next to what the enrichers added.
- **Reviewing** keeps only the latest review (`review_verdict`, `review_note`, `reviewed_by`,
  `reviewed_at`). A second leader overwrites the first.
- **Accepting** applies `proposed`, as below, in one transaction, and records `applied_id`.

### What accepting does

- **New term:**
  - Creates the term and translation through the existing create path, Algolia indexing
    included. A trashed term with the same headword is revived, as the create action does today.
  - If the term now exists and isn't trashed (someone added it meanwhile), accepting is blocked.
    The admin can instead "merge as a new translation", which turns the suggestion into a
    `glossary_translation create` on that term.
- **New translation:** appends it at the end of the term's translations.
- **Edit:**
  - Applies only the fields that differ from `base`.
  - If the stored translation no longer matches `base` on those fields (it changed since the
    suggestion was made), the finalize screen shows the three versions (base, current, proposed)
    and the admin must confirm.
- **Flag:** the admin chooses one of:
  - dismiss it, with a note
  - turn it into an edit (opens the editable card, and the flag's note goes with it)
  - move the translation to the trash, using the existing soft delete
- **Audit fields:**
  - New rows: `created_by` = the submitter, `updated_by` = the admin who finalized. This fits
    "term author = created-by" (see the glossary author semantics).
  - Edits: `updated_by` = the admin.
  - *(Confirm when building.)*
- The submitter's `note` is never copied anywhere. `proposed.discussion` (filled in by the
  submitter or an enricher) is the translation's discussion, and is applied like any other field.

## Schema (approved 2026-11-17)

New file `drizzle/tables/suggestion.ts`. Three new enums in `drizzle/tables/enums.ts`.

```ts
export const suggestionTargetEnum = pgEnum('suggestion_target', ['glossary_term', 'glossary_translation']);
// later: ALTER TYPE ... ADD VALUE 'paragraph'
export const suggestionActionEnum = pgEnum('suggestion_action', ['create', 'edit', 'flag']);
export const suggestionStatusEnum = pgEnum('suggestion_status', [
  'pending', 'accepted', 'rejected', 'withdrawn', 'dismissed',
]);
export const reviewVerdictEnum = pgEnum('review_verdict', ['looks_right', 'needs_work']);

export const suggestionsTable = pgTable('suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  targetKind: suggestionTargetEnum('target_kind').notNull(),
  action: suggestionActionEnum('action').notNull(),
  status: suggestionStatusEnum('status').notNull().default('pending'),

  // One nullable FK per kind of target: real foreign keys instead of one polymorphic id.
  // `set null` so history outlives a purged term or translation (the screen shows "target removed").
  glossaryId: uuid('glossary_id').references(() => glossariesTable.id, { onDelete: 'set null' }),
  translationId: uuid('translation_id').references(() => glossaryTranslationsTable.id, { onDelete: 'set null' }),
  // later: paragraphId: uuid('paragraph_id').references(() => paragraphsTableNew.id, { onDelete: 'set null' }),

  // Field values. Each shape is checked by a zod schema per target kind (below).
  base: jsonb('base'),                       // the target's fields when suggested (edit, flag)
  submitted: jsonb('submitted'),             // what the submitter entered; never changes
  proposed: jsonb('proposed'),               // the current proposal; enrichers edit it
  note: text('note'),                        // the submitter's free note; history only
  context: jsonb('context'),                 // where it was made: { documentId, sectionId, paragraphId, page }

  enrichedBy: text('enriched_by'),
  enrichedAt: timestamp('enriched_at'),
  readyBy: text('ready_by'),                 // the "ready for review" mark (information only)
  readyAt: timestamp('ready_at'),
  reviewVerdict: reviewVerdictEnum('review_verdict'),
  reviewNote: text('review_note'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  decidedBy: text('decided_by'),
  decidedAt: timestamp('decided_at'),
  decisionNote: text('decision_note'),
  appliedId: uuid('applied_id'),             // the term or translation created or changed on accept

  ...auditAtFields,                          // created_at = submitted at; deleted_at unused
  ...auditByFields,                          // created_by = the submitter
}, (t) => [
  index('suggestions_status_idx').on(t.status),
  index('suggestions_glossary_id_idx').on(t.glossaryId),
  index('suggestions_translation_id_idx').on(t.translationId),
]);
```

**Why it's built this way:**
- **One table for every target.** The queue, history, notifications, badge and "under review"
  display are the same whatever is being changed. Only the field shapes differ, and those live
  in jsonb.
- **Field shapes are checked in zod** (`app/validations/suggestion.validation.ts`):
  - **translation fields:** language, term, sourceName, volume, sourceText, targetText, author,
    discussion, partOfSpeech, phonetic. All optional except `term`, and `language` on create.
  - **new term:** `{ sourceTerm, phonetic?, cbetaFrequency?, translation }`. Only `sourceTerm`
    and `translation.term` are required.
  - **flag:** no values.
- **No CHECK constraint** tying FKs to kinds, because `set null` would break it. The zod
  schema and the store enforce it instead.
- **History is the table itself.** Rows are never deleted. A withdrawn suggestion stays, with
  its status.

## Interface

### Suggest a term (replaces the Create Glossary Entry modal)

- **Opens from** the glossary page header (for everyone) and from the working document's context
  menu on a selection.
- **Fields shown:**
  - the Chinese term (filled in from the selection), with pinyin filled in automatically
  - the translation
  - a free note
  - the language, defaulting to the project's target language and changeable behind a small
    control
- **Filled in from where the user is:** the document as `sourceName`, the page as `volume`
  (from the paragraph metadata `page`), the paragraph as `sourceText`, and the target
  paragraph as `targetText` if there is one. Each is shown and can be unticked ("attach this
  passage").
- If the term already exists, the form offers "suggest a translation for it" instead.

### Suggest a translation, suggest an edit (on the display card)

- **"Suggest an edit"** turns `GlossaryDetail`'s translation block into edit mode, with the same
  layout and type sizes:
  - Click any text to edit it.
  - Empty fields show as faint prompts ("+ add source passage").
  - Changed fields are marked, each with a reset link.
  - Part of speech, author and phonetic sit behind "More details".
  - At the bottom: "Why this change?" (the note) and **Submit suggestion**.
- **"Suggest a translation"** adds an empty block in the same style at the end of the card.
- **"Flag"** (⚑) on each translation asks for a note only.
- The current `GlossaryForm` edit modal goes away from the glossary page. Data Management's
  direct editing is unaffected.

### Pending suggestions in the glossary

- **Accepted values stay the main content.** A pending edit never replaces them on screen.
- **Pending edit:** a "1 suggested change" marker on the translation, opening an old → new view
  (old struck through).
- **Pending new translation:** shown inline as a block with a dashed border and a tinted
  background, labelled "Under review · suggested by X, 3 days ago". Review state and "ready" show
  when set.
- **Pending new term:** listed in search results with a "Proposed" label, so it isn't suggested a
  second time. Algolia knows nothing about suggestions, so search adds a database lookup of
  pending new terms by headword (and possibly rendering). Don't index suggestions in Algolia.
- **Flags:** "⚑ flagged · 1" on the translation, opening the notes.
- **Colour:** yellow-600 is already used for selection and search highlights, so it can't be
  used here. Use a dashed border plus a distinct hue (violet or sky blue), defined once as
  shared classes or tokens. The dashed border also keeps it readable for colour-blind users.
- **A "Show suggestions" switch,** on by default.
- **For leaders:** "Looks right" and "Needs work" (with an optional note) on each pending block.
- **For tech and admin:** "Enrich", which opens the same editable card on `proposed`, and
  "Mark ready".

### Suggestions tab (`/glossary/suggestions`)

- **Visible to everyone.** The buttons depend on permission.
- **List:** kind, term, submitter, age, completeness (how many optional fields are filled),
  ready, review verdict.
- **Filters:** kind, status (pending by default), mine, ready, reviewed.
- **Admin sort:** reviewed-as-good and ready first, then oldest.
- **Detail / finalize screen:** card layout with old → new changes. It shows the out-of-date
  warning when the stored values changed since the suggestion was made, and the
  duplicate-headword check for new terms. Actions: accept, reject (with a note), merge as a new
  translation, and for flags the three outcomes above. Finalizing something no leader has
  reviewed takes one extra confirmation.
- **History:** each term's card links to its accepted and rejected suggestions.

## Notifications

- **Store first.** Email only points to the Suggestions tab.
- **Badge** on the Suggestions tab: pending count for admins, unreviewed count for leaders,
  not-yet-enriched count for tech.
- **Daily digest email** through Resend (`app/providers/resend.ts`, already used by the admin
  page):
  - to admins and leaders: "N waiting, M reviewed, K ready"
  - to tech: "N new with little data"
  - **Needs a Vercel cron.** There are no crons in `vercel.json` today, so add one, protected by
    `CRON_SECRET`. Skip the email when there's nothing new.
- **Optional email to the submitter** when their suggestion is accepted or rejected.

## Steps

Each step is its own PR, run through typecheck, eslint and vitest.

0. **Close the create hole now. Done (working tree, 2026-11-17).** The create action in
   `app/routes/_app.glossary.tsx` checked only sign-in. It now refuses a role without
   `Maintain`/`Glossary` with a 403, until step 3 replaces the route. Covered by
   `tests/glossary.create.route.test.ts`.
1. **Schema. Done (working tree, 2026-11-17).** As drafted above.
   - Enum values in `app/utils/constants.ts` (`SUGGESTION_*_VALUES`, `REVIEW_VERDICT_VALUES`,
     with their types), Postgres enums in `drizzle/tables/enums.ts`.
   - The table in `drizzle/tables/suggestion.ts` (`suggestionsTable`, `ReadSuggestion`,
     `CreateSuggestion`). Relations in `drizzle/relations.ts`: suggestion → glossary and
     translation, and `suggestions` on both of those.
   - `drizzle/migrations/0030_add-suggestions.sql`, generated by `pnpm db:generate --name
     add-suggestions`. A second `db:generate` reports no changes.
   - Additive only (4 types, 1 table, 2 FKs, 3 indexes), so it's safe while the previous
     deployment still serves.
   - **Tested on a throwaway Postgres 16** (docker `postgres:16-alpine`, 0000–0030 applied with
     psql, one transaction each):
     - status defaults to `pending`
     - an unknown enum value is refused
     - a hard delete of a term (which cascades to its translations) keeps its suggestions,
       with `glossary_id` / `translation_id` set to null and `base` intact
   - **Not applied** to the shared dev database or prod. Deploys run `db:migrate` themselves.
2. **Store, validation and service:**
   - zod shapes
   - `SuggestionStore`
   - the transitions (submit, edit own, withdraw, enrich, mark ready, review, accept, reject,
     dismiss, merge)
   - applying, with the out-of-date check
   - unit tests per transition and permission
3. **Suggest-a-term form and flag,** server actions included. **The permission change ships
   here**, together with:
   - removing the direct create, add and remove paths from the glossary page
   - the context-menu entry in the working document
4. **Edit-as-card** on `GlossaryDetail`, and suggest-a-translation. The edit modal is removed
   from the glossary page.
5. **Pending display:** card blocks, markers, the "Proposed" label in search and its database
   lookup, the colour tokens, the show switch, and the leader review buttons.
6. **Suggestions tab:** list, filters, finalize screen, enrich, mark ready, history link.
7. **Notifications:** badge, digest cron, submitter emails.
8. **Later:** paragraph suggestions (adding the `paragraph_id` column and the `paragraph` enum
   value) if and when translation paragraphs need them.

Steps 3 and 4 may merge if editors would otherwise be left with neither an edit button nor a
suggest button for a while.

## To confirm when building

- When the submitter loses the ability to edit their suggestion: suggested as once it has been
  enriched or reviewed.
- Audit fields on accept: suggested as `created_by` = submitter, `updated_by` = the finalizing
  admin.
- Whether pending new terms are also matched by their rendering in search, or by headword only.
