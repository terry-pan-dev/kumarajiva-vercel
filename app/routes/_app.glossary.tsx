import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@vercel/remix';

import { Outlet, redirect, useLoaderData } from '@remix-run/react';
import { json } from '@vercel/remix';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { type z } from 'zod';

import { assertAuthUser } from '~/auth.server';
import { Can, defineAbilityFor } from '~/authorisation';
import { FormModal } from '~/components/FormModal';
import { SuggestTermDialog } from '~/components/glossary/SuggestTermDialog';
import { newTranslation, SourceTermFields, TranslationsFields } from '~/components/GlossaryForm';
import { SideBarTrigger } from '~/components/SideBarTrigger';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Toaster } from '~/components/ui/toaster';
import { validatePayloadOrThrow } from '~/lib/payload.validation';
import { entryFromCreateForm } from '~/services/glossary.create';
import { createGlossaryAndIndexInAlgolia, reviveTrashedGlossary } from '~/services/glossary.service';
import { GlossaryStore } from '~/services/glossary.store';
import { readUsers } from '~/services/user.service';
import { glossaryCreateFormSchema } from '~/validations/glossary.validation';

export const config = {
  memory: 3009,
};

export const meta: MetaFunction = () => {
  return [{ title: 'Glossary' }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  const users = await readUsers();
  return json({ user, users: users.map((user) => ({ id: user.id, username: user.username, email: user.email })) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  // Creating a term directly is for the trusted roles (GlossaryData Maintain: tech, admin);
  // everyone else suggests one (docs/plans/glossary-suggestions.md). The <Can> around the create
  // button only hides it; without this check any signed-in user could POST here directly.
  if (defineAbilityFor(user).cannot('Maintain', 'GlossaryData')) {
    return json({ success: false, errors: ['You are not allowed to create glossary entries.'] }, { status: 403 });
  }

  // FormModal posts a form with a list (the translations) as JSON in `data`.
  const formData = await request.formData();
  const validatedData = validatePayloadOrThrow({
    schema: glossaryCreateFormSchema,
    formData: JSON.parse(String(formData.get('data') ?? '{}')),
  });
  // The trash is checked too: a trashed row still holds the term under the unique index.
  const [existing] = await GlossaryStore.findByTermsIncludingTrash([validatedData.sourceTerm]);
  if (existing && !existing.deletedAt) {
    return json(
      { errors: [{ sourceTerm: 'This term already exists, please search glossary by this term first' }] },
      { status: 400 },
    );
  }
  const { term, translations } = entryFromCreateForm(validatedData, user, { id: uuidv4(), now: new Date() });
  // A term in the trash is created afresh over the trashed row, which keeps its uuid.
  const newGlossary = existing
    ? await reviveTrashedGlossary(existing.id, term, translations)
    : await createGlossaryAndIndexInAlgolia(term, translations);
  return json({ success: true, glossary: newGlossary });
};

export default function GlossaryLayout() {
  const { user, users } = useLoaderData<typeof loader>();
  return (
    <div className="bg-secondary flex h-auto min-h-screen flex-col px-2 lg:px-4">
      <div className="flex items-center justify-between">
        <div className="my-2 flex h-10 w-full items-center justify-between gap-2 text-xl font-semibold">
          <div className="flex items-center gap-2">
            <SideBarTrigger />
            Glossary
          </div>
          <div className="flex items-center gap-2">
            {/* The trusted roles create entries directly; everyone else suggests one. */}
            <Can I="Maintain" this="GlossaryData">
              <GlossaryCreateModal />
            </Can>
            <Can not I="Maintain" this="GlossaryData">
              <SuggestTermButton />
            </Can>
          </div>
        </div>
      </div>
      <Separator className="mb-4 bg-yellow-600" />
      <Outlet context={{ user, users }} />
      <Toaster />
    </div>
  );
}

// One blank translation to start with. A constant, as FormModal resets to it on every close.
// FormModal types defaultValues as a whole form.
const CREATE_DEFAULTS = { translations: [newTranslation()] } as unknown as z.infer<typeof glossaryCreateFormSchema>;

const GlossaryCreateModal = () => {
  return (
    <FormModal
      title="Create Glossary Entry"
      defaultValues={CREATE_DEFAULTS}
      schema={glossaryCreateFormSchema}
      trigger={<Button variant="default">Add New Entry</Button>}
    >
      <div className="flex max-h-[66vh] flex-col gap-4 overflow-y-auto px-4">
        <SourceTermFields isNew />
        <TranslationsFields keepOne />
      </div>
    </FormModal>
  );
};

const SuggestTermButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>
        Suggest a Term
      </Button>
      <SuggestTermDialog open={open} onOpenChange={setOpen} />
    </>
  );
};
