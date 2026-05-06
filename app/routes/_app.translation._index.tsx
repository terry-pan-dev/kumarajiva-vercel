import { Link, useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@vercel/remix';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { TranslationCard } from '~/components/Card';
import { ErrorInfo } from '~/components/ErrorInfo';
import { getProjects } from '~/services/project.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  try {
    const projects = await getProjects();
    return json({ success: true, projects });
  } catch (error) {
    console.error(error);
    throw new Error('Internal Server Error');
  }
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
};

export default function TranslationIndex() {
  const { projects } = useLoaderData<typeof loader>();
  const [projectId, setProjectId] = useState('');

  const Projects = projects.map((project) => (
    <motion.div
      key={project.id}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
      className="m-2 cursor-pointer rounded-lg shadow-md"
    >
      <div onClick={() => setProjectId(project.id)}>
        <TranslationCard
          isSelected={projectId === project.id}
          originTitle={project.sourceDocument.title}
          targetTitle={project.targetDocument.title}
        />
      </div>
    </motion.div>
  ));

  const selectedProject = projects.find((p) => p.id === projectId);
  const sourceSections = selectedProject?.sourceDocument?.sections ?? [];
  const targetSections = selectedProject?.targetDocument?.sections ?? [];

  const Sections = sourceSections.map((section, index) => (
    <motion.div
      key={section.id}
      whileHover={{ scale: 1.02 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      exit={{ opacity: 0, x: '100%' }}
      initial={{ opacity: 0, x: '100%' }}
      className="mb-2 cursor-pointer rounded-lg shadow-md"
    >
      <Link to={`/translation/${section.id}`}>
        <TranslationCard originTitle={section.title ?? ''} targetTitle={targetSections[index]?.title ?? undefined} />
      </Link>
    </motion.div>
  ));

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-lg">
        <p>There are no translation projects available.</p>
        <p>Please contact the administrator to set up a project.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={false}
      transition={{ duration: 0.5 }}
      animate={{ flexDirection: projectId ? 'row' : 'column' }}
      className={`flex h-full ${projectId ? 'flex-row' : 'items-center justify-center'}`}
    >
      <motion.div
        animate={{ height: '100%' }}
        transition={{ duration: 0.3 }}
        className={`flex-col items-center justify-start ${projectId ? 'w-1/2 overflow-y-auto' : 'w-full'}`}
      >
        {Projects}
      </motion.div>
      <AnimatePresence>
        {projectId && (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            exit={{ opacity: 0, x: '100%' }}
            initial={{ opacity: 0, x: '100%' }}
            className="m-2 w-1/2 overflow-y-auto"
          >
            {Sections}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
