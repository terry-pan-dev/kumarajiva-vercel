import { Link, useLoaderData, useRouteError } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { TranslationCard } from '../components/Card';
import { ErrorInfo } from '../components/ErrorInfo';
import { readSutras } from '../services/sutra.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const sutras = await readSutras({
      skip: 0,
      take: 10,
    });
    return json({ success: true, sutras });
  } catch (error) {
    console.error(error);
    throw new Error('Internal Server Error');
  }
};

export const action = async () => {
  return json({ success: true });
};

export const ErrorBoundary = () => {
  const error = useRouteError();

  return <ErrorInfo error={error} />;
};

export default function TranslationIndex() {
  const { sutras } = useLoaderData<typeof loader>();
  const [sutraId, setSutraId] = useState('');
  const Sutras = sutras.map((sutra) => (
    <motion.div
      key={sutra.id}
      className="m-2 cursor-pointer rounded-lg shadow-md"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
    >
      <Link to={`/reference?sutraId=${sutra.id}`} onClick={() => setSutraId(sutra.id)}>
        <TranslationCard title={sutra.title} subtitle={sutra.category} translator={sutra.translator} />
      </Link>
    </motion.div>
  ));

  const rolls = useMemo(() => {
    const rolls = sutras.find((sutra) => sutra.id === sutraId)?.rolls?.filter((roll) => roll.sutraId === sutraId);
    return rolls;
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
      <Link to={`/reference/${roll.id}`}>
        <TranslationCard title={roll.title} subtitle={roll.subtitle} />
      </Link>
    </motion.div>
  ));

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
