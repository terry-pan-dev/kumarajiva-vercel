import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@vercel/remix';

import { Outlet, redirect, useLoaderData } from '@remix-run/react';
import { json } from '@vercel/remix';
import { v4 as uuidv4 } from 'uuid';

import type { CreateGlossary } from '../../drizzle/schema';

import { assertAuthUser } from '../auth.server';
import { Can } from '../authorisation';
import { FormInput, FormModal, FormTextarea } from '../components/FormModal';
import { SideBarTrigger } from '../components/SideBarTrigger';
import { Button } from '../components/ui/button';
import { Divider } from '../components/ui/divider';
import { Separator } from '../components/ui/separator';
import { Toaster } from '../components/ui/toaster';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import { createGlossaryAndIndexInAlgolia, getGlossariesByGivenGlossaries } from '../services/glossary.service';
import { readUsers } from '../services/user.service';
import { glossaryFormSchema } from '../validations/glossary.validation';
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
  const formData = Object.fromEntries(await request.formData());
  const validatedData = validatePayloadOrThrow({ schema: glossaryFormSchema, formData });
  const isGlossaryExist = await getGlossariesByGivenGlossaries([validatedData.glossaryChinese]);
  console.log(isGlossaryExist);
  if (isGlossaryExist.length > 0) {
    return json(
      { errors: [{ glossaryChinese: 'This term already exists, please search glossary by this term' }] },
      { status: 400 },
    );
  }
  const glossary: CreateGlossary = {
    id: uuidv4(),
    glossary: validatedData.glossaryChinese,
    phonetic: validatedData.phoneticChinese,
    subscribers: 0,
    author: user.username || '翻譯團隊',
    cbetaFrequency: validatedData.cbetaFrequencyChinese || '0',
    discussion: validatedData.discussionChinese || '',
    translations: [
      {
        glossary: validatedData.glossary,
        language: user.targetLang || 'english',
        sutraName: validatedData.sutraName || '佛教常用詞',
        volume: validatedData.volume || 'unknown',
        updatedBy: user.id,
        updatedAt: new Date().toISOString(),
        originSutraText: validatedData.sutraText || '',
        targetSutraText: validatedData.sutraText || '',
        author: validatedData.author || '',
        partOfSpeech: validatedData.partOfSpeech || '',
        phonetic: validatedData.phonetic || '',
      },
    ],
    createdBy: user.id,
    updatedBy: user.id,
  };
  const newGlossary = await createGlossaryAndIndexInAlgolia(glossary);
  return json({ success: true, glossary: newGlossary });
};

export default function GlossaryLayout() {
  const { user, users } = useLoaderData<typeof loader>();
  return (
    <div className="flex h-auto min-h-screen flex-col bg-secondary px-2 lg:px-4">
      <div className="flex items-center justify-between">
        <div className="my-2 flex h-10 w-full items-center justify-between gap-2 text-xl font-semibold">
          <div className="flex items-center gap-2">
            <SideBarTrigger />
            Glossary
          </div>
          <Can I="Read" this="Glossary">
            <GlossaryCreateModal />
          </Can>
        </div>
      </div>
      <Separator className="mb-4 bg-yellow-600" />
      <Outlet context={{ user, users }} />
      <Toaster />
    </div>
  );
}

const GlossaryCreateModal = () => {
  return (
    <FormModal
      schema={glossaryFormSchema}
      title="Create Glossary For Chinese Root"
      trigger={
        <Button className="w-20" variant="default">
          New
        </Button>
      }
    >
      <div className="h-[calc(100vh-10rem)] overflow-y-auto px-2">
        <GlossaryCreateForm />
      </div>
    </FormModal>
  );
};

const GlossaryCreateForm = () => {
  const { user } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <FormInput required label="Glossary" name="glossaryChinese" description="The Chinese glossary term." />
        <FormInput required label="Phonetic" name="phoneticChinese" description="The phonetic of the glossary term." />
        <FormTextarea label="Sutra Text" name="sutraTextChinese" description="The text of the sutra." />
        <FormTextarea label="Volume" name="volumeChinese" description="The volume of the sutra." />
        <FormTextarea
          label="CBETA Frequency"
          name="cbetaFrequencyChinese"
          description="The frequency of the sutra in CBETA."
        />
        <FormTextarea label="Author" name="authorChinese" description="The author of the glossary." />
        <FormTextarea
          label="Discussion"
          name="discussionChinese"
          description="Any additional discussion about the glossary."
        />
      </div>
      <Divider className="py-1 lg:py-3">{user?.targetLang?.toUpperCase()}</Divider>
      <div className="grid grid-cols-2 gap-4">
        <FormInput required name="glossary" label="Glossary" description={`The ${user?.targetLang} glossary term.`} />
        <FormInput name="phonetic" label="Phonetic" description="The phonetic of the glossary." />
        <FormTextarea
          name="sutraName"
          label="Sutra Name"
          placeholder="佛教常用詞(default)"
          description="The name of the sutra."
        />
        <FormTextarea name="partOfSpeech" label="Part of Speech" description="The part of speech of the glossary." />
        <FormTextarea name="sutraText" label="Sutra Text" description="The text of the sutra." />
        <FormTextarea name="volume" label="Volume" description="The volume of the sutra." />
        <FormTextarea
          name="cbetaFrequency"
          label="CBETA Frequency"
          description="The frequency of the sutra in CBETA."
        />
        <FormTextarea name="author" label="Author" description="The author of the glossary." />
        <FormTextarea
          name="discussion"
          label="Discussion"
          description="Any additional discussion about the glossary."
        />
      </div>
    </div>
  );
};
