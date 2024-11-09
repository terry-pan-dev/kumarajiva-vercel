import { Link, useLoaderData, useOutletContext, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { type ReadRoll, type ReadSutra, type ReadUser } from '../../drizzle/schema';
import { assertAuthUser } from '../auth.server';
import { TranslationCard } from '../components/Card';
import { ErrorInfo } from '../components/ErrorInfo';
import { FormInput, FormModal } from '../components/FormModal';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import { createTargetRoll } from '../services/roll.service';
import { createTargetSutra, readSutrasAndRolls } from '../services/sutra.service';
import { createRollSchema } from '../validations/roll.validation';
import { createSutraSchema } from '../validations/sutra.validation';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  try {
    const sutras = await readSutrasAndRolls({ user });
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
  const [sutraId, setSutraId] = useState('');

  const sutras = useMemo(() => {
    return remoteSutras.map((sutra) => ({
      ...sutra,
      createdAt: new Date(sutra.createdAt),
      updatedAt: new Date(sutra.updatedAt),
      deletedAt: sutra.deletedAt ? new Date(sutra.deletedAt) : null,
    }));
  }, [remoteSutras]);

  const Sutras = sutras.map((sutra) => (
    <motion.div
      key={sutra.id}
      className="m-2 cursor-pointer rounded-lg shadow-md"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
    >
      {sutra.children ? (
        <div onClick={() => setSutraId(sutra.id)}>
          <TranslationCard title={sutra.title} subtitle={sutra.category} translator={sutra.translator} />
        </div>
      ) : (
        <FormModal
          title={`Create ${context.user.targetLang} sutra`}
          schema={createSutraSchema}
          trigger={
            <Link to={`/translation?sutraId=${sutra.id}`}>
              <TranslationCard title={sutra.title} subtitle={sutra.category} translator={sutra.translator} />
            </Link>
          }
        >
          <CreateSutraForm sutra={sutra} />
        </FormModal>
      )}
    </motion.div>
  ));

  const rolls = useMemo(() => {
    const sutra = sutras.find((sutra) => sutra.id === sutraId);
    const rolls = sutra?.rolls?.filter((roll) => roll.sutraId === sutraId);
    return rolls?.map((roll) => ({
      ...roll,
      createdAt: new Date(roll.createdAt),
      updatedAt: new Date(roll.updatedAt),
      deletedAt: roll.deletedAt ? new Date(roll.deletedAt) : null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sutraId, sutras]);

  const targetSutraId = useMemo(() => {
    const sutra = sutras.find((sutra) => sutra.id === sutraId);
    return sutra?.children?.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sutraId]);

  const Rolls = rolls?.map((roll) => (
    <motion.div
      key={roll.id}
      className="cursor-pointer rounded-lg shadow-md"
      whileHover={{ scale: 1.02 }}
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ duration: 0.3 }}
    >
      {roll.children ? (
        <Link to={`/translation/${roll.id}`}>
          <TranslationCard title={roll.title} subtitle={roll.subtitle} />
        </Link>
      ) : (
        <FormModal
          title={`Create ${context.user.targetLang} roll`}
          schema={createRollSchema}
          trigger={
            <Link to={`/translation?sutraId=${targetSutraId}&rollId=${roll.id}`}>
              <TranslationCard title={roll.title} subtitle={roll.subtitle} />
            </Link>
          }
        >
          <CreateRollForm roll={roll} />
        </FormModal>
      )}
    </motion.div>
  ));

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
    <motion.div
      className={`flex ${sutraId ? 'flex-row' : 'items-center'}`}
      initial={false}
      animate={{ flexDirection: sutraId ? 'row' : 'column' }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="flex flex-col"
        animate={{
          width: sutraId ? '50%' : '50%',
          height: sutraId ? 'auto' : '100%',
        }}
        transition={{ duration: 0.3 }}
      >
        {Sutras}
      </motion.div>
      <AnimatePresence>
        {sutraId && (
          <motion.div
            className="m-2 flex w-1/2 flex-col gap-4"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ duration: 0.3 }}
          >
            {Rolls}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const CreateSutraForm = ({ sutra }: { sutra: ReadSutra }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormInput name="title" label={sutra.title} required description="Translate the title of the sutra." />
      {sutra.subtitle && (
        <FormInput name="subtitle" label={sutra.subtitle} required description="Translate the subtitle of the sutra." />
      )}
      <FormInput name="category" label={sutra.category} required description="Translate the category of the sutra." />
      <FormInput
        name="translator"
        label={sutra.translator}
        required
        description="Translate the translator of the sutra."
      />
    </div>
  );
};

const CreateRollForm = ({ roll }: { roll: ReadRoll }) => {
  return (
    <div>
      <FormInput name="title" label={roll.title} required description="Translate the title of the roll." />
      <FormInput name="subtitle" label={roll.subtitle} required description="Translate the subtitle of the roll." />
    </div>
  );
};
