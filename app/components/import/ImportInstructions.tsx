import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

export function ImportInstructions() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-xl text-primary">File Format Instructions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-base">
        <div>
          <h4 className="mb-1 text-base font-medium text-primary">CSV Format:</h4>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-sm text-muted-foreground">
            {`origin,translation\n諸法因緣生,All dharmas arise from causes and conditions\n諸法因緣滅,All dharmas cease through causes and conditions`}
          </pre>
        </div>
        <div>
          <h4 className="mb-1 text-base font-medium text-primary">Excel Format:</h4>
          <p className="text-base text-muted-foreground">
            Create an Excel file with the same column structure. The first row should contain headers: "origin" and
            "translation".
          </p>
        </div>
        <div>
          <h4 className="mb-1 text-base font-medium text-primary">Notes:</h4>
          <ul className="list-inside list-disc space-y-1 text-base text-muted-foreground">
            <li>The "origin" column is required (also accepts "original" for backwards compatibility)</li>
            <li>The "translation" column is optional (also accepts "target")</li>
            <li>All other columns will be ignored</li>
            <li>Column names are case-insensitive</li>
            <li>Empty rows will be skipped</li>
            <li>
              Importing will <strong>replace</strong> all existing data for the selected roll
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
