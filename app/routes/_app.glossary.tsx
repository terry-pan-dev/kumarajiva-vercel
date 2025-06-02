import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@vercel/remix';
import type { PropsWithChildren } from 'react';

import { Link, Outlet, redirect, useLoaderData } from '@remix-run/react';
import { json } from '@vercel/remix';
import { ChevronDown } from 'lucide-react';
import { pinyin } from 'pinyin-pro';
import { useCallback, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';

import type { CreateGlossary } from '../../drizzle/schema';

import { assertAuthUser } from '../auth.server';
import { Can } from '../authorisation';
import { FormInput, FormModal, FormTextarea } from '../components/FormModal';
import { Icons } from '../components/icons';
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
      { errors: [{ glossaryChinese: 'This term already exists, please search glossary by this term first' }] },
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
        volume: validatedData.volume || '-',
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
          <div className="flex items-center gap-2">
            <Can I="Download" this="Glossary">
              <Link reloadDocument to="/glossary/download" download="glossary.csv">
                <Icons.Download className="h-6 w-6 text-slate-800" />
              </Link>
            </Can>
            <Can I="Update" this="Glossary">
              <GlossaryCreateModal />
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

const GlossaryCreateModal = () => {
  return (
    <FormModal
      schema={glossaryFormSchema}
      title="Create Glossary For Chinese And English"
      trigger={
        <Button className="w-20" variant="default">
          New
        </Button>
      }
    >
      <GlossaryCreateForm />
    </FormModal>
  );
};

const GlossaryCreateForm = () => {
  const { user } = useLoaderData<typeof loader>();
  const [chineseAccordionOpen, setChineseAccordionOpen] = useState(false);
  const [targetLangAccordionOpen, setTargetLangAccordionOpen] = useState(false);
  const anyAccordionOpen = chineseAccordionOpen || targetLangAccordionOpen;
  const { watch, setValue } = useFormContext();
  const glossaryChinese = watch('glossaryChinese');
  const phoneticChinese = watch('phoneticChinese');
  const handleGlossaryChineseOnBlur = useCallback(() => {
    if (glossaryChinese && !phoneticChinese) {
      // Example: Transform glossaryChinese to phonetic (replace with your logic, e.g., pinyin)
      const phoneticValue = pinyin(glossaryChinese); // Placeholder logic
      setValue('phoneticChinese', phoneticValue, {
        shouldValidate: true, // Trigger validation
        shouldDirty: true, // Mark field as dirty
      });
    }
  }, [glossaryChinese, phoneticChinese, setValue]);
  return (
    <div
      className="px-2 transition-[height] duration-300"
      style={{
        height: anyAccordionOpen ? '80vh' : '45vh',
        overflowY: 'auto',
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormInput
          required
          name="glossaryChinese"
          label="Glossary Chinese"
          onBlur={handleGlossaryChineseOnBlur}
          description="The Chinese glossary term."
        />
        <FormInput required label="Phonetic" name="phoneticChinese" description="The phonetic of the glossary term." />
        <div className="col-span-2">
          <CustomAccordion onToggle={setChineseAccordionOpen} title="Optional Fields For Chinese">
            <div className="grid grid-cols-2 gap-4">
              <FormTextarea label="Sutra Text" name="sutraTextChinese" description="The text of the sutra." />
              <FormTextarea label="Volume" name="volumeChinese" description="The volume of the sutra." />
              <FormTextarea
                label="CBETA Frequency"
                name="cbetaFrequencyChinese"
                description="The frequency of the sutra in CBETA."
              />
              <FormTextarea label="Author" name="authorChinese" description="The author of the glossary." />
              <span className="col-span-2">
                <FormTextarea
                  label="Discussion"
                  name="discussionChinese"
                  description="Any additional discussion about the glossary."
                />
              </span>
            </div>
          </CustomAccordion>
        </div>
      </div>
      <Divider className="my-4 lg:py-3">
        <span className="text-md">{user?.targetLang?.toUpperCase()}</span>
      </Divider>
      <div className="grid grid-cols-1 gap-4">
        <FormInput
          required
          name="glossary"
          label="Glossary English"
          description={`The ${user?.targetLang} glossary term.`}
        />
        <CustomAccordion
          onToggle={setTargetLangAccordionOpen}
          title={`Optional Fields For ${user?.targetLang?.charAt(0).toUpperCase()}${user?.targetLang?.slice(1)}`}
        >
          <div className="grid grid-cols-2 gap-4">
            <FormInput name="phonetic" label="Phonetic" description="The phonetic of the glossary." />
            <FormInput
              name="sutraName"
              label="Sutra Name"
              placeholder="佛教常用詞(default)"
              description="The name of the sutra."
            />
            <FormTextarea
              name="partOfSpeech"
              label="Part of Speech"
              description="The part of speech of the glossary."
            />
            <FormTextarea name="sutraText" label="Sutra Text" description="The text of the sutra." />
            <FormTextarea name="volume" label="Volume" description="The volume of the sutra." />
            <FormTextarea name="author" label="Author" description="The author of the glossary." />
          </div>
        </CustomAccordion>
      </div>
    </div>
  );
}; // or any icon library

export function CustomAccordion({
  title = 'More Details',
  children,
  onToggle,
}: PropsWithChildren<{ title?: string; onToggle?: (open: boolean) => void }>) {
  const [open, setOpen] = useState(false);

  const handleToggle = () => {
    setOpen((o) => {
      const newOpen = !o;
      if (onToggle) onToggle(newOpen);
      return newOpen;
    });
  };

  return (
    <div className="mx-auto w-full bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={handleToggle}
        className="flex w-full flex-col items-center focus:outline-none"
      >
        <div className="flex w-full items-center">
          <div className="flex-1 border-t border-dashed border-blue-600" />
          <span className="mx-4 whitespace-nowrap text-center text-sm font-semibold">{title}</span>
          <div className="flex-1 border-t border-dashed border-blue-600" />
        </div>
        <div className="flex w-full justify-center">
          <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="mt-4" aria-hidden={!open}>
          {children}
        </div>
      )}
    </div>
  );
}
