import { useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@vercel/remix';
import { Download, FileText, ChevronRight } from 'lucide-react'; // Assuming you have lucide-react, or use your Icon component

import { assertAuthUser } from '../auth.server';
import { ErrorInfo } from '../components/ErrorInfo';
import { readSutrasAndRolls } from '../services/sutra.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  try {
    const sutras = await readSutrasAndRolls({ user });

    // // --- DEBUGGING LOGS ---
    // console.log("==========================================");
    // console.log("FULL SUTRA STRUCTURE DEBUG");
    // console.log("==========================================");

    // // Using console.dir with depth: null ensures you see every nested level
    // console.dir(sutras, { depth: null, colors: true });

    // console.log("==========================================");

    return json({ success: true, sutras });
  } catch (error) {
    console.error(error);
    throw new Error('Internal Server Error');
  }
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
};

export default function DataManagementIndex() {
  const { sutras } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <div className="mb-8 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Data Management</h1>
        <p className="mt-1 text-sm text-gray-500">Import translations, export data from rolls to Excel.</p>
      </div>

      <div className="space-y-4">
        {sutras.map((sutra) => (
          <div key={sutra.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {/* Native collapsible element */}
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between bg-gray-50 p-4 transition hover:bg-gray-100">
                <div className="flex items-center gap-3">
                  <div className="text-gray-400 transition-transform group-open:rotate-90">
                    <ChevronRight size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {sutra.title} {sutra.children?.title}
                    </h3>
                    <div className="text-xs text-gray-500">
                      {sutra.rolls?.length || 0} Rolls • {sutra.category}
                    </div>
                  </div>
                </div>
              </summary>

              <div className="divide-y divide-gray-100 border-t border-gray-200">
                {sutra.rolls && sutra.rolls.length > 0 ? (
                  sutra.rolls.map((roll) => (
                    <div key={roll.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <FileText size={18} className="text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-700">
                            {roll.title} {roll.children?.title}
                          </p>
                          {roll.subtitle && <p className="text-xs text-gray-500">{roll.subtitle}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Export Button -> Points to Resource Route */}
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`/resources/export/${roll.id}`}
                          className="flex items-center gap-2 rounded bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                        >
                          <Download size={14} />
                          Export xlsx
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-gray-500">No rolls found for this sutra.</div>
                )}
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
