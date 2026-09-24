// The working document page: choose where a translation working group meeting
// starts and how many paragraphs it covers, then download them as a .docx. Each
// section opens into cards showing excerpts of every text for a paragraph, so
// the range — and any missing data — is visible before exporting. Only the
// sections that are opened load their text. The start defaults to the
// paragraph after the project's last export. The format panel sets how each
// text looks and in what order; changes save automatically for the project.
import { Link, useFetcher, useLoaderData, useRouteError, type ShouldRevalidateFunction } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from '@vercel/remix';
import { ArrowLeft, ChevronRight, FileDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { loader as cardsLoader } from '~/routes/_app.resources.working-document-cards.$projectId.$sectionId';
import type { WorkingDocumentCard, WorkingDocumentSection } from '~/services/workingDocument.export';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { ErrorInfo } from '~/components/ErrorInfo';
import {
  WorkingDocumentFormatEditor,
  WorkingDocumentPreview,
} from '~/components/translation/WorkingDocumentFormatEditor';
import {
  inRange,
  overlapWithSection,
  paragraphNumber,
  paragraphRange,
  type ParagraphPosition,
  type ParagraphRange,
} from '~/components/translation/workingDocumentRange';
import { Button, Input, Label } from '~/components/ui';
import { getProjectWithReferences } from '~/services/project.service';
import { getDocument } from '~/services/text.service';
import {
  getLastExportedParagraphId,
  getWorkingDocumentFormat,
  readWorkingDocumentSections,
  resolveWorkingDocumentStart,
  saveWorkingDocumentFormat,
} from '~/services/workingDocument.export';
import {
  MAX_WORKING_DOCUMENT_PARAGRAPHS,
  workingDocumentFormatSchema,
  type WorkingDocumentBlock,
} from '~/validations/workingDocument.validation';

export const meta: MetaFunction = () => [{ title: 'Working document' }];

export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  if (defineAbilityFor(user).cannot('Maintain', 'Translation')) {
    throw new Response('You are not allowed to export working documents.', { status: 403 });
  }

  const project = params.projectId ? await getProjectWithReferences(params.projectId) : undefined;
  if (!project) throw new Response('Project not found', { status: 404 });

  const [sections, sourceDocument, targetDocument] = await Promise.all([
    readWorkingDocumentSections({
      sourceDocumentId: project.sourceDocumentId,
      targetDocumentId: project.targetDocumentId,
    }),
    getDocument(project.sourceDocumentId),
    getDocument(project.targetDocumentId),
  ]);
  const { start, lastExported } = await resolveWorkingDocumentStart({
    sections,
    lastExportedParagraphId: getLastExportedParagraphId(project),
  });

  return json({
    project: {
      id: project.id,
      name: project.name,
      sourceTitle: sourceDocument?.title ?? null,
      targetTitle: targetDocument?.title ?? null,
    },
    sections,
    format: getWorkingDocumentFormat(project),
    // What each text is, for the format panel.
    names: {
      source: `Source — ${sourceDocument?.title ?? ''}`,
      target: `Translation — ${targetDocument?.title ?? ''}`,
      ...Object.fromEntries(project.references.map((r) => [`reference:${r.documentId}`, r.document.title])),
    } as Record<string, string>,
    start,
    lastExported,
  });
}

// Autosaves the project's format.
export async function action({ params, request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  if (defineAbilityFor(user).cannot('Maintain', 'Translation')) {
    return json({ error: 'You are not allowed to change the working document format.' }, { status: 403 });
  }
  const formData = await request.formData();
  if (formData.get('intent') !== 'save-format' || !params.projectId) {
    return json({ error: 'Unknown action.' }, { status: 400 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('format') ?? ''));
  } catch {
    return json({ error: 'Invalid format.' }, { status: 400 });
  }
  const parsed = workingDocumentFormatSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'Invalid format.' }, { status: 400 });

  await saveWorkingDocumentFormat(params.projectId, parsed.data);
  return json({ error: null });
}

// Saving the format changes nothing the page shows from its loader, so skip
// reloading it (and its queries) on every autosave.
export const shouldRevalidate: ShouldRevalidateFunction = ({ formData, defaultShouldRevalidate }) =>
  formData?.get('intent') === 'save-format' ? false : defaultShouldRevalidate;

type Block = { key: string; label: string; color: string };

const DEFAULT_COUNT = 20;

// ─── Cards ───────────────────────────────────────────────────────────────────

function ParagraphCard({
  card,
  blocks,
  isStart,
  isInRange,
  onSelect,
}: {
  card: WorkingDocumentCard;
  blocks: Block[];
  isStart: boolean;
  isInRange: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Bring the start into view within its section's list (e.g. on load) —
  // scrolling only that list, not the page, so the page header stays put.
  useEffect(() => {
    const card = ref.current;
    const list = card?.parentElement;
    if (!isStart || !card || !list) return;
    const top = card.offsetTop; // the list is the positioning parent
    if (top < list.scrollTop || top + card.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - 8;
    }
  }, [isStart]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition ${
        isStart
          ? 'border-yellow-600 bg-yellow-50 ring-2 ring-yellow-600'
          : isInRange
            ? 'border-yellow-600/50 bg-yellow-50'
            : 'bg-background hover:bg-muted/50'
      }`}
    >
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-semibold">{card.number}</span>
        {isStart && <span className="text-xs font-medium text-yellow-700">Start</span>}
        {card.passageKey && <span className="text-muted-foreground ml-auto text-xs">{card.passageKey}</span>}
      </div>
      <div className="grid gap-0.5">
        {blocks.map((block) => {
          const text = card.texts[block.key];
          return (
            <div key={block.key} className="flex min-w-0 gap-2 text-sm">
              <span style={{ color: block.color }} className="w-24 shrink-0 truncate text-xs leading-5 font-semibold">
                {block.label}
              </span>
              {text ? (
                <span className="min-w-0 truncate">{text}</span>
              ) : (
                <span className="text-xs leading-5 text-rose-600 italic">missing</span>
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function SectionPanel({
  projectId,
  section,
  sections,
  blocks,
  isOpen,
  start,
  range,
  onToggle,
  onSelect,
  onCardsLoaded,
}: {
  projectId: string;
  section: WorkingDocumentSection;
  sections: WorkingDocumentSection[];
  blocks: Block[];
  isOpen: boolean;
  start: ParagraphPosition | null;
  range: ParagraphRange | null;
  onToggle: () => void;
  onSelect: (card: WorkingDocumentCard, position: number) => void;
  onCardsLoaded: (sectionId: string, cards: WorkingDocumentCard[]) => void;
}) {
  const fetcher = useFetcher<typeof cardsLoader>();

  // A section's text loads the first time it is opened, and is kept after.
  useEffect(() => {
    if (isOpen && !fetcher.data && fetcher.state === 'idle') {
      fetcher.load(`/resources/working-document-cards/${projectId}/${section.id}`);
    }
  }, [isOpen, fetcher, projectId, section.id]);

  useEffect(() => {
    if (fetcher.data?.cards.length) onCardsLoaded(section.id, fetcher.data.cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const overlap = range ? overlapWithSection(sections, range, section.id) : 0;
  const hasStart = start?.sectionId === section.id;

  return (
    <div className="bg-background rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-lg p-3 text-left transition"
      >
        <ChevronRight
          size={16}
          className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
        />
        <span className="font-medium">
          {section.order} · {section.title || 'Untitled section'}
          {section.targetTitle && <span className="text-muted-foreground font-normal"> / {section.targetTitle}</span>}
        </span>
        <span className="text-muted-foreground text-xs">{section.paragraphCount} paragraphs</span>
        {overlap > 0 && (
          <span className="ml-auto rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
            {hasStart ? 'Starts here · ' : ''}
            {overlap} in export
          </span>
        )}
      </button>

      {isOpen && (
        <div className="border-t p-3">
          {!fetcher.data ? (
            <p className="text-muted-foreground text-sm">Loading paragraphs…</p>
          ) : fetcher.data.error ? (
            <p className="text-sm text-red-600">{fetcher.data.error}</p>
          ) : (
            <div className="relative grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
              {fetcher.data.cards.map((card, position) => (
                <ParagraphCard
                  card={card}
                  key={card.id}
                  blocks={blocks}
                  onSelect={() => onSelect(card, position)}
                  isStart={hasStart && start?.position === position}
                  isInRange={!!range && inRange(sections, range, { sectionId: section.id, position })}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const AUTOSAVE_DELAY_MS = 800;

export default function WorkingDocumentPage() {
  const {
    project,
    sections,
    format: savedFormat,
    names,
    start: defaultStart,
    lastExported,
  } = useLoaderData<typeof loader>();

  const [openSectionId, setOpenSectionId] = useState<string | null>(defaultStart?.sectionId ?? null);
  // The start paragraph: its id (for the download) and position (for the range).
  const [start, setStart] = useState<(ParagraphPosition & { paragraphId: string }) | null>(defaultStart);
  const [count, setCount] = useState(String(DEFAULT_COUNT));
  const [blocks, setBlocks] = useState<WorkingDocumentBlock[]>(savedFormat.blocks);
  // Loaded sections' cards, for the preview of the start paragraph.
  const [cardsBySection, setCardsBySection] = useState<Record<string, WorkingDocumentCard[]>>({});

  // Autosave: a short pause after the last change, so a drag or typing a label
  // saves once.
  const saveFetcher = useFetcher<typeof action>();
  const lastSaved = useRef(JSON.stringify({ blocks: savedFormat.blocks }));
  const [pendingSave, setPendingSave] = useState(false);
  useEffect(() => {
    const format = JSON.stringify({ blocks });
    if (format === lastSaved.current) return setPendingSave(false);
    setPendingSave(true);
    const timer = setTimeout(() => {
      lastSaved.current = format;
      setPendingSave(false);
      saveFetcher.submit({ intent: 'save-format', format }, { method: 'post' });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);
  const saveStatus =
    pendingSave || saveFetcher.state !== 'idle'
      ? 'Saving…'
      : saveFetcher.data?.error
        ? saveFetcher.data.error
        : saveFetcher.data
          ? 'Saved for this project'
          : null;

  const countNumber = Number(count);
  const countValid =
    Number.isInteger(countNumber) && countNumber >= 1 && countNumber <= MAX_WORKING_DOCUMENT_PARAGRAPHS;
  const range = useMemo(
    () => (start && countValid ? paragraphRange(sections, start, countNumber) : null),
    [sections, start, countValid, countNumber],
  );

  const describe = (position: ParagraphPosition) => {
    const section = sections.find((s) => s.id === position.sectionId);
    return `${paragraphNumber(sections, position)}${section?.title ? ` (${section.title})` : ''}`;
  };

  const startCard = start ? cardsBySection[start.sectionId]?.[start.position] : undefined;

  // The download carries the format on screen, so the file matches it even
  // before the autosave lands.
  const downloadHref =
    start && countValid
      ? `/resources/working-document/${project.id}?${new URLSearchParams({
          start: start.paragraphId,
          count,
          format: JSON.stringify({ blocks }),
        })}`
      : undefined;

  if (sections.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-lg">
        <p>This project’s source document has no paragraphs yet.</p>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto pb-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-2">
        <div className="mb-3">
          <Link to="/translation" className="text-muted-foreground flex items-center gap-1 text-xs hover:underline">
            <ArrowLeft size={12} /> Back to projects
          </Link>
          <h2 className="text-lg font-semibold">{project.name || 'Untitled project'} — working document</h2>
          <p className="text-sm">
            {project.sourceTitle}
            {project.targetTitle && <span className="text-muted-foreground"> / {project.targetTitle}</span>}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Exports the source, translation, and reference texts for a set number of paragraphs to a text document, for
            use in a translation working group meeting.
          </p>
          <p className="mt-3 text-base font-semibold">Click the paragraph you want to start exporting from.</p>
        </div>
        {sections.map((section) => (
          <SectionPanel
            range={range}
            start={start}
            blocks={blocks}
            key={section.id}
            section={section}
            sections={sections}
            projectId={project.id}
            isOpen={openSectionId === section.id}
            onToggle={() => setOpenSectionId((id) => (id === section.id ? null : section.id))}
            onCardsLoaded={(id, cards) => setCardsBySection((all) => ({ ...all, [id]: cards }))}
            onSelect={(card, position) => setStart({ sectionId: section.id, position, paragraphId: card.id })}
          />
        ))}
      </div>

      <aside className="bg-background h-fit space-y-5 rounded-lg border p-4 lg:sticky lg:top-0 lg:max-h-full lg:overflow-y-auto">
        <section className="space-y-4">
          <div className="grid gap-1">
            <Label>Start</Label>
            <p className="text-sm">{start ? describe(start) : 'Choose a paragraph'}</p>
            {lastExported && (
              <p className="text-muted-foreground text-xs">
                {lastExported.atEnd
                  ? `The last export ended at ${lastExported.number}, the end of the text so far.`
                  : `Continues from the last export, which ended at ${lastExported.number}.`}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="working-document-count">Number of paragraphs</Label>
            <Input
              min={1}
              step={1}
              value={count}
              type="number"
              className="w-32"
              id="working-document-count"
              max={MAX_WORKING_DOCUMENT_PARAGRAPHS}
              onChange={(e) => setCount(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {!countValid
                ? `Enter a number from 1 to ${MAX_WORKING_DOCUMENT_PARAGRAPHS}.`
                : range
                  ? `Ends at ${describe(range.last)}${
                      range.included < countNumber
                        ? ` — only ${range.included} paragraph${range.included === 1 ? '' : 's'} left in the document`
                        : ''
                    }.`
                  : null}
            </p>
          </div>
          {/* A plain link: the browser handles the file download itself. */}
          <Button asChild className={downloadHref ? 'w-full' : 'pointer-events-none w-full opacity-50'}>
            <a download href={downloadHref} aria-disabled={!downloadHref}>
              <FileDown size={16} className="mr-1.5" />
              Download .docx
            </a>
          </Button>
        </section>

        <section className="space-y-3 border-t pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Format</h3>
            {saveStatus && (
              <span className={`text-xs ${saveFetcher.data?.error ? 'text-red-600' : 'text-muted-foreground'}`}>
                {saveStatus}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Drag to set the order of the texts in each paragraph. Changes are saved for this project.
          </p>
          <WorkingDocumentFormatEditor names={names} blocks={blocks} onChange={setBlocks} />
          {startCard && (
            <div className="grid gap-1.5">
              <Label>Preview</Label>
              <WorkingDocumentPreview blocks={blocks} texts={startCard.texts} number={startCard.number} />
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
