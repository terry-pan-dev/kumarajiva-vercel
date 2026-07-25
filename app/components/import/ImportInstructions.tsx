import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

type Props = {
  originKey: string | null;
  targetKey: string | null;
  referenceKeys: string[];
};

export function ImportInstructions({ originKey, targetKey, referenceKeys }: Props) {
  // Fall back to generic placeholders when a document has no key set yet.
  const origin = originKey ?? 'origin';
  const target = targetKey ?? 'translation';
  const firstRef = referenceKeys[0];

  // Example headers: the two main documents, the first reference (if any), then
  // the reserved passage_key column.
  const exampleColumns = [origin, target, ...(firstRef ? [firstRef] : []), 'passage_key'];
  const csvExample = [
    exampleColumns.join(','),
    [`諸法因緣生`, `All dharmas arise from causes and conditions`, ...(firstRef ? ['…'] : []), 'T30n1579.1.1'].join(
      ',',
    ),
    [`諸法因緣滅`, `All dharmas cease through causes and conditions`, ...(firstRef ? ['…'] : []), 'T30n1579.1.2'].join(
      ',',
    ),
  ].join('\n');

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-primary text-xl">File Format Instructions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-base">
        <div>
          <h4 className="text-primary mb-1 text-base font-medium">Columns are document keys</h4>
          <p className="text-muted-foreground text-base">
            Each column header is the <strong>key</strong> of the document it fills. A document&apos;s key is shown next
            to it in Data Management → Works &amp; Documents. Headers are matched to keys case-insensitively.
          </p>
        </div>

        <div>
          <h4 className="text-primary mb-1 text-base font-medium">This section&apos;s keys</h4>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-base">
            <li>
              Origin: <code className="bg-muted rounded px-1 font-mono">{origin}</code>
              {!originKey && ' — no key set yet; set one in Works & Documents'}
            </li>
            <li>
              Translation: <code className="bg-muted rounded px-1 font-mono">{target}</code>
              {!targetKey && ' — no key set yet; set one in Works & Documents'}
            </li>
            {referenceKeys.length > 0 && (
              <li>
                References:{' '}
                {referenceKeys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ', '}
                    <code className="bg-muted rounded px-1 font-mono">{k}</code>
                  </span>
                ))}
              </li>
            )}
            <li>
              <code className="bg-muted rounded px-1 font-mono">passage_key</code> — optional; the shared identity for a
              row across every document
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-primary mb-1 text-base font-medium">CSV example</h4>
          <pre className="bg-muted text-muted-foreground overflow-x-auto rounded p-3 text-sm">{csvExample}</pre>
          <p className="text-muted-foreground mt-1 text-base">
            An XLSX file works the same way — put the document keys in the first (header) row.
          </p>
        </div>

        <div>
          <h4 className="text-primary mb-1 text-base font-medium">How rows are matched</h4>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-base">
            <li>
              Include <strong>any subset</strong> of the documents — one column or all of them. A new reference can be
              added later as a single column.
            </li>
            <li>
              Rows are aligned to existing data by <strong>passage key and/or position</strong>, which must be
              consistent with what&apos;s already stored. Add a <code className="font-mono">passage_key</code> column to
              target specific passages regardless of row order.
            </li>
            <li>
              The import is a pure upsert: matching rows are updated, new rows inserted, and{' '}
              <strong>existing rows not in the file are left unchanged</strong> — nothing is deleted. So only the rows
              that need changing need to be included.
            </li>
            <li>
              Empty cells are skipped; a column that is entirely empty (or absent) leaves that document untouched.
            </li>
            <li>Fully-empty rows are ignored.</li>
          </ul>
        </div>

        <div>
          <h4 className="text-primary mb-1 text-base font-medium">Setup notes</h4>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-base">
            <li>Each document&apos;s section (matched to this section by order) must already exist and be named.</li>
            <li>
              Reference columns whose key isn&apos;t a reference on this project, or whose section isn&apos;t set up,
              are skipped and reported after import.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
