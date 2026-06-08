import { Link, useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@vercel/remix';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { assertAuthUser } from '~/auth.server';
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
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());

  const toggleProject = (projectId: string) => {
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-lg">
        <p>No projects available for translation.</p>
        <p>Please ask an administrator to set up a project in Data Management.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        {projects.map((project) => {
          const isOpen = openProjects.has(project.id);
          const sourceSections = project.sourceDocument?.sections ?? [];
          const targetSections = project.targetDocument?.sections ?? [];

          return (
            <div key={project.id} className="border-border bg-background overflow-hidden rounded-lg border shadow-sm">
              <div
                onClick={() => toggleProject(project.id)}
                className="bg-muted hover:bg-muted/80 flex cursor-pointer items-center justify-between p-4 transition"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                  >
                    <ChevronRight size={20} />
                  </div>
                  <div>
                    <h3 className="text-foreground text-lg font-semibold">
                      {project.sourceDocument?.title}
                      {project.targetDocument && (
                        <span className="text-muted-foreground ml-2 font-normal">/ {project.targetDocument.title}</span>
                      )}
                    </h3>
                    <div className="text-muted-foreground text-xs">
                      {sourceSections.length} sections • {project.name}
                    </div>
                  </div>
                </div>
              </div>

              {isOpen && (
                <div className="divide-border border-border divide-y border-t">
                  {sourceSections.length > 0 ? (
                    sourceSections.map((sourceSection, index) => {
                      const targetSection = targetSections[index];
                      return (
                        <div key={sourceSection.id} className="hover:bg-muted/50 flex items-center justify-between p-4">
                          <div>
                            <p className="text-foreground font-medium">
                              {sourceSection.title}
                              {targetSection?.title && (
                                <span className="text-muted-foreground ml-2 font-normal">/ {targetSection.title}</span>
                              )}
                            </p>
                          </div>
                          {targetSection ? (
                            <Link
                              to={`/translation/${sourceSection.id}`}
                              className="bg-primary text-primary-foreground hover:bg-primary/80 rounded px-3 py-1.5 text-xs font-medium transition"
                            >
                              Translate
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">No translation section</span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-muted-foreground p-4 text-center text-sm">
                      No sections found for this project.
                    </div>
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
