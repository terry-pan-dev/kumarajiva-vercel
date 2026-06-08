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

type SectionNode = { id: string; title: string | null; targetTitle: string | null; children: SectionNode[] };

type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;
type TopLevelSection = NonNullable<LoaderData['projects'][number]['sourceDocument']>['sections'][number];

const toSectionNode = (section: TopLevelSection, targetByOrder: Map<number, string | null>): SectionNode => ({
  id: section.id,
  title: section.title,
  targetTitle: targetByOrder.get(section.order) ?? null,
  children: section.children.map((c) => ({
    id: c.id,
    title: c.title,
    targetTitle: targetByOrder.get(c.order) ?? null,
    children: [],
  })),
});

function SectionTitle({ title, targetTitle }: { title: string | null; targetTitle: string | null }) {
  return (
    <span>
      {title}
      {targetTitle && <span className="text-muted-foreground ml-1 font-normal">/ {targetTitle}</span>}
    </span>
  );
}

function SectionRow({ section, depth }: { section: SectionNode; depth: number }) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = section.children.length > 0;

  if (hasChildren) {
    return (
      <>
        <div
          onClick={() => setIsOpen((prev) => !prev)}
          style={{ paddingLeft: `${depth * 20 + 16}px` }}
          className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 py-3 pr-4 transition"
        >
          <ChevronRight
            size={16}
            className={`text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          />
          <span className="text-foreground font-medium">
            <SectionTitle title={section.title} targetTitle={section.targetTitle} />
          </span>
        </div>
        {isOpen && section.children.map((child) => <SectionRow key={child.id} section={child} depth={depth + 1} />)}
      </>
    );
  }

  return (
    <Link
      to={`/translation/${section.id}`}
      style={{ paddingLeft: `${depth * 20 + 16}px` }}
      className="hover:bg-muted/50 flex items-center justify-between py-3 pr-4 transition"
    >
      <span className="text-foreground">
        <SectionTitle title={section.title} targetTitle={section.targetTitle} />
      </span>
      {/* status badge — added once translation_progress table is available */}
    </Link>
  );
}

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
                    <div className="text-muted-foreground text-xs">{sourceSections.length} sections</div>
                  </div>
                </div>
              </div>

              {isOpen && (
                <div className="divide-border border-border divide-y border-t">
                  {sourceSections.length > 0 ? (
                    (() => {
                      const targetByOrder = new Map(
                        (project.targetDocument?.sections ?? []).map((s) => [s.order, s.title]),
                      );
                      return sourceSections.map((section) => (
                        <SectionRow depth={0} key={section.id} section={toSectionNode(section, targetByOrder)} />
                      ));
                    })()
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
