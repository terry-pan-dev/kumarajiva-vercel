// Downloads a working document (.docx, for Google Docs) for a translation
// working group meeting: `count` passages of the project from the `start`
// paragraph, with source, translation and reference texts. Downloading also
// records the last paragraph exported, so the next export starts after it.
import { type LoaderFunctionArgs } from '@vercel/remix';
import { Packer } from 'docx';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { getProject } from '~/services/project.service';
import { buildWorkingDocument, buildWorkingDocumentFilename } from '~/services/workingDocument.docx';
import {
  getWorkingDocumentFormat,
  readPassagesForWorkingDocument,
  reconcileWorkingDocumentFormat,
  recordWorkingDocumentExport,
} from '~/services/workingDocument.export';
import { MAX_WORKING_DOCUMENT_PARAGRAPHS, workingDocumentFormatSchema } from '~/validations/workingDocument.validation';

// The format the page is showing, so the file matches the screen even if the
// autosave has not landed yet. Falls back to the saved format.
const requestedFormat = (raw: string | null) => {
  if (!raw) return undefined;
  try {
    const parsed = workingDocumentFormatSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (defineAbilityFor(user).cannot('Maintain', 'Translation')) throw new Response('Forbidden', { status: 403 });

  const project = params.projectId ? await getProject(params.projectId) : undefined;
  if (!project) throw new Response('Project not found', { status: 404 });

  const url = new URL(request.url);
  const startParagraphId = url.searchParams.get('start');
  const count = Number(url.searchParams.get('count'));
  if (!startParagraphId || !Number.isInteger(count) || count < 1 || count > MAX_WORKING_DOCUMENT_PARAGRAPHS) {
    throw new Response(`Choose a start paragraph and between 1 and ${MAX_WORKING_DOCUMENT_PARAGRAPHS} paragraphs`, {
      status: 400,
    });
  }

  const passages = await readPassagesForWorkingDocument({
    sourceDocumentId: project.sourceDocumentId,
    targetDocumentId: project.targetDocumentId,
    references: project.references,
    startParagraphId,
    count,
  }).catch((error: Error) => {
    throw new Response(error.message, { status: 400 });
  });

  const saved = getWorkingDocumentFormat(project);
  const format = reconcileWorkingDocumentFormat(requestedFormat(url.searchParams.get('format')), saved);
  const doc = buildWorkingDocument(passages, format.blocks, {
    titles: [project.sourceDocument.title, project.targetDocument.title],
    subtitle: 'Translation group working document',
  });
  const buffer = await Packer.toBuffer(doc);
  const last = passages[passages.length - 1];
  if (last) await recordWorkingDocumentExport(project.id, last.paragraphId);
  const filename = buildWorkingDocumentFilename(project.name, passages);

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // filename* carries non-ASCII project names and the en dash intact.
      'Content-Disposition': `attachment; filename="working-document.docx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
};
