import { Link, useLoaderData, useOutletContext, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { ErrorInfo } from '~/components/ErrorInfo';
import { FormInput, FormModal } from '~/components/FormModal';
import { type ReadRoll, type ReadSutra, type ReadUser } from '~/drizzle/schema';
import { validatePayloadOrThrow } from '~/lib/payload.validation';
import { createTargetRoll } from '~/services/roll.service';
import { createTargetSutra, readSutrasAndRolls } from '~/services/sutra.service';
import { createRollSchema } from '~/validations/roll.validation';
import { createSutraSchema } from '~/validations/sutra.validation';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  try {
    const sutras = await readSutrasAndRolls();
    return json({ success: true, sutras });
  } catch (error) {
    console.error(error);
    throw new Error('Internal Server Error');
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const { searchParams } = new URL(request.url);
  const sutraId = searchParams.get('sutraId');
  const rollId = searchParams.get('rollId');
  if (sutraId && !rollId) {
    const formData = Object.fromEntries(await request.formData());
    const result = validatePayloadOrThrow({
      formData,
      schema: createSutraSchema,
    });
    const targetSutra = {
      ...result,
      teamId: user.teamId,
      subtitle: result.subtitle || null,
      createdBy: user.id,
      updatedBy: user.id,
      parentId: sutraId,
      language: user.targetLang,
    };
    await createTargetSutra({
      originSutraId: sutraId,
      targetSutra,
    });
  }
  if (rollId && sutraId) {
    const formData = Object.fromEntries(await request.formData());
    const result = validatePayloadOrThrow({
      formData,
      schema: createRollSchema,
    });
    const targetRoll = {
      ...result,
      sutraId: sutraId,
      parentId: rollId,
      createdBy: user.id,
      updatedBy: user.id,
      finish: false,
    };
    await createTargetRoll({
      originRollId: rollId,
      targetRoll,
    });
  }
  return json({ success: true });
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
};

export default function TranslationIndex() {
  const context = useOutletContext<{ user: ReadUser }>();
  const { sutras: remoteSutras } = useLoaderData<typeof loader>();
  const [openSutras, setOpenSutras] = useState<Set<string>>(new Set());

  const sutras = useMemo(() => {
    return remoteSutras.map((sutra) => ({
      ...sutra,
      createdAt: new Date(sutra.createdAt),
      updatedAt: new Date(sutra.updatedAt),
      deletedAt: sutra.deletedAt ? new Date(sutra.deletedAt) : null,
    }));
  }, [remoteSutras]);

  const toggleSutra = (sutraId: string) => {
    setOpenSutras((prev) => {
      const next = new Set(prev);
      if (next.has(sutraId)) next.delete(sutraId);
      else next.add(sutraId);
      return next;
    });
  };

  if (sutras.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-lg">
        <p>
          There is no <span className="font-semibold">{context.user.originLang.toUpperCase()}</span> sutra to translate
          under your language.
        </p>
        <p>Please contact the administrator to update your language.</p>
        <p>Or wait for new sutras to be added to your language.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        {sutras.map((sutra) => {
          const isOpen = openSutras.has(sutra.id);
          const targetSutraId = sutra.children?.id ?? null;

          return (
            <div key={sutra.id} className="border-border bg-background overflow-hidden rounded-lg border shadow-sm">
              {/* Sutra header */}
              <div
                onClick={() => sutra.children && toggleSutra(sutra.id)}
                className={`bg-muted hover:bg-muted/80 flex items-center justify-between p-4 transition ${sutra.children ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} ${!sutra.children ? 'opacity-30' : ''}`}
                  >
                    <ChevronRight size={20} />
                  </div>
                  <div>
                    <h3 className="text-foreground text-lg font-semibold">
                      {sutra.title}
                      {sutra.children && (
                        <span className="text-muted-foreground ml-2 font-normal">/ {sutra.children.title}</span>
                      )}
                    </h3>
                    <div className="text-muted-foreground text-xs">
                      {sutra.rolls?.length || 0} rolls • {sutra.category}
                    </div>
                  </div>
                </div>

                {!sutra.children && (
                  <FormModal
                    schema={createSutraSchema}
                    title={`Create ${context.user.targetLang} sutra`}
                    trigger={
                      <Link to={`/translation?sutraId=${sutra.id}`}>
                        <span className="bg-primary text-primary-foreground hover:bg-primary/80 rounded px-2.5 py-1.5 text-xs font-medium transition">
                          Create translation
                        </span>
                      </Link>
                    }
                  >
                    <CreateSutraForm sutra={sutra} />
                  </FormModal>
                )}
              </div>

              {/* Rolls list */}
              {isOpen && (
                <div className="divide-border border-border divide-y border-t">
                  {sutra.rolls && sutra.rolls.length > 0 ? (
                    sutra.rolls.map((roll) => (
                      <div key={roll.id} className="hover:bg-muted/50 flex items-center justify-between p-4">
                        <div>
                          <p className="text-foreground font-medium">
                            {roll.title}
                            {roll.children && (
                              <span className="text-muted-foreground ml-2 font-normal">/ {roll.children.title}</span>
                            )}
                          </p>
                          {roll.subtitle && <p className="text-muted-foreground text-xs">{roll.subtitle}</p>}
                        </div>

                        {roll.children ? (
                          <Link
                            to={`/translation/${roll.id}`}
                            className="bg-primary text-primary-foreground hover:bg-primary/80 rounded px-3 py-1.5 text-xs font-medium transition"
                          >
                            Translate
                          </Link>
                        ) : (
                          <FormModal
                            schema={createRollSchema}
                            title={`Create ${context.user.targetLang} roll`}
                            trigger={
                              <Link to={`/translation?sutraId=${targetSutraId}&rollId=${roll.id}`}>
                                <span className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded px-3 py-1.5 text-xs font-medium transition">
                                  Create translation
                                </span>
                              </Link>
                            }
                          >
                            <CreateRollForm roll={roll} />
                          </FormModal>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground p-4 text-center text-sm">No rolls found for this sutra.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CreateSutraForm = ({ sutra }: { sutra: ReadSutra }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormInput required name="title" label={sutra.title} description="Translate the title of the sutra." />
      {sutra.subtitle && (
        <FormInput required name="subtitle" label={sutra.subtitle} description="Translate the subtitle of the sutra." />
      )}
      <FormInput required name="category" label={sutra.category} description="Translate the category of the sutra." />
      <FormInput
        required
        name="translator"
        label={sutra.translator}
        description="Translate the translator of the sutra."
      />
    </div>
  );
};

const CreateRollForm = ({ roll }: { roll: Pick<ReadRoll, 'title' | 'subtitle'> }) => {
  return (
    <div>
      <FormInput required name="title" label={roll.title} description="Translate the title of the roll." />
      <FormInput required name="subtitle" label={roll.subtitle} description="Translate the subtitle of the roll." />
    </div>
  );
};
