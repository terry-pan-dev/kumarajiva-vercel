// The fields the Create and Update Glossary Entry forms share: the source term, and the list of
// translations with a button to add one. Both forms send the same shape (glossaryCreateFormSchema,
// glossaryEditFormSchema), so a translation looks the same wherever it is entered.
import { Plus, Trash2 } from 'lucide-react';
import { pinyin } from 'pinyin-pro';
import { useCallback } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { Can } from '~/authorisation';
import { Button } from '~/components/ui/button';
import { Divider } from '~/components/ui/divider';
import { DEFAULT_TARGET_LANG } from '~/utils/constants';
import { GLOSSARY_TRANSLATION_LANGUAGES } from '~/utils/lang';

import { FormInput, FormSelect, FormTextarea } from './FormModal';

export const DISCUSSION_DESCRIPTION =
  'Notes on this translation, e.g. why this rendering was chosen, sources or alternatives considered. Optional.';

const LANGUAGE_OPTIONS = GLOSSARY_TRANSLATION_LANGUAGES.map((language) => ({ value: language, label: language }));

// What "+ Add translation" appends: every field the schema expects, blank, with no id (so the
// save reads it as an addition).
const NEW_TRANSLATION = {
  language: DEFAULT_TARGET_LANG,
  term: '',
  phonetic: '',
  sourceName: '',
  author: '',
  volume: '',
  partOfSpeech: '',
  sourceText: '',
  targetText: '',
  discussion: '',
};

export const newTranslation = () => ({ ...NEW_TRANSLATION });

// `isNew`: a term being created, so the headword can be typed (and its pinyin filled in).
export function SourceTermFields({ isNew = false }: { isNew?: boolean }) {
  const { getValues, setValue } = useFormContext();
  const fillPhonetic = useCallback(() => {
    const sourceTerm = getValues('sourceTerm');
    if (sourceTerm && !getValues('phonetic')) {
      setValue('phonetic', pinyin(sourceTerm), { shouldValidate: true, shouldDirty: true });
    }
  }, [getValues, setValue]);
  return (
    <>
      <Divider>CHINESE</Divider>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormInput
          required
          label="Term"
          name="sourceTerm"
          disabled={!isNew}
          description="The term in Chinese"
          onBlur={isNew ? fillPhonetic : undefined}
        />
        <FormInput required name="phonetic" label="Phonetic" description="The phonetic of the term" />
        <FormInput name="cbetaFrequency" label="CBETA Frequency" description="The CBETA frequency of the term" />
      </div>
    </>
  );
}

// `keepOne`: the create form, where an entry needs at least one translation, so the last one
// cannot be removed. Adding and removing need Maintain (the save checks it too); Update may
// only edit the translations there are.
export function TranslationsFields({ keepOne = false }: { keepOne?: boolean }) {
  const { fields, append, remove } = useFieldArray({ name: 'translations' });
  // The stored ids, to tell a translation being added (no id) from an existing one. Read from
  // the values: `fields[i].id` is useFieldArray's own key, not the translation's id.
  const translations: { id?: string; language?: string }[] = useWatch({ name: 'translations' }) ?? [];
  return (
    <>
      {fields.map((field, index) => {
        const translation = translations[index] ?? {};
        const isNew = !translation.id;
        const language = (translation.language ?? '').toUpperCase();
        return (
          <div key={field.id} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Divider className="flex-1">
                {isNew ? `NEW TRANSLATION${language && ` · ${language}`}` : language}
              </Divider>
              {/* Removal takes effect on Save, like every other edit in this form. */}
              {!(keepOne && fields.length === 1) && (
                <Can I="Maintain" this="Glossary">
                  <Button
                    size="icon"
                    type="button"
                    variant="ghost"
                    title="Remove translation"
                    onClick={() => remove(index)}
                    aria-label="remove-translation"
                  >
                    <Trash2 className="text-muted-foreground hover:text-destructive h-4 w-4" />
                  </Button>
                </Can>
              )}
            </div>
            <TranslationFields index={index} isNew={isNew} />
          </div>
        );
      })}
      <Can I="Maintain" this="Glossary">
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => append(newTranslation())}>
            <Plus className="mr-1 h-4 w-4" />
            Add translation
          </Button>
        </div>
      </Can>
    </>
  );
}

// One translation. Its language is chosen only while it is new; a stored one keeps its own.
function TranslationFields({ index, isNew }: { index: number; isNew: boolean }) {
  const name = (field: string) => `translations.${index}.${field}`;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {isNew && (
        <>
          <FormSelect
            required
            label="Language"
            name={name('language')}
            options={LANGUAGE_OPTIONS}
            description="The language of the translation"
          />
          <div className="hidden sm:block" />
        </>
      )}
      <FormInput required name={name('term')} label="Translation Term" description="The translated term" />
      <FormInput label="Phonetic" name={name('phonetic')} description="The phonetic of the translation" />
      <FormInput
        label="Document Name"
        name={name('sourceName')}
        description="The work this translation is from, e.g. a sutra"
      />
      <FormInput name={name('author')} label="Document Author" description="The author of that document" />
      <FormInput label="Section" name={name('volume')} description="Where in the document, e.g. a volume or chapter" />
      <FormInput label="Part of Speech" name={name('partOfSpeech')} description="The part of speech of the term" />
      <FormTextarea label="Origin Text" name={name('sourceText')} description="The passage in the original language" />
      <FormTextarea label="Target Text" name={name('targetText')} description="The passage in the target language" />
      <span className="sm:col-span-2">
        <FormTextarea label="Discussion" name={name('discussion')} description={DISCUSSION_DESCRIPTION} />
      </span>
    </div>
  );
}
