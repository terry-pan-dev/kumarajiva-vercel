// Glossary Editor, in Data Management: one page, two tabs (docs/plans/glossary-suggestions.md).
// - Entries (/data/glossary/editor/entries): find an entry and change it directly (step 4).
// - Suggestions (/data/glossary/editor/suggestions): the queue of suggestions from the glossary
//   page, to enrich and finalize (step 7).
// Both are for GlossaryData Maintain (tech, admin). Each tab keeps its own loader, action and
// gate; this layout only holds the tabs.
import { NavLink, Outlet, useRouteError } from '@remix-run/react';
import { useTranslation } from 'react-i18next';

import { ErrorInfo } from '~/components/ErrorInfo';
import { cn } from '~/lib/utils';

export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
}

const TABS = [
  { to: 'entries', label: 'editor.tabs.entries' },
  { to: 'suggestions', label: 'editor.tabs.suggestions' },
] as const;

export default function GlossaryEditor() {
  const { t } = useTranslation('glossary');
  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-6">
      <nav aria-label={t('editor.tabs.label')} className="bg-muted inline-flex gap-1 rounded-lg p-1">
        {TABS.map((tab) => (
          <NavLink
            to={tab.to}
            key={tab.to}
            className={({ isActive }) =>
              cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                isActive ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-primary',
              )
            }
          >
            {t(tab.label)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
