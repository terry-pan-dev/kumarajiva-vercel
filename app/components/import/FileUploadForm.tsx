import { Form } from '@remix-run/react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

import type { ImportResult } from '~/services/file.service';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

type Props = {
  sutraId: string;
  rollId: string;
  sutraName: string;
  originalLanguage: string;
  translationLanguage: string;
  isSubmitting: boolean;
  navigationIntent: string | null;
  fileName: string;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  errorResult: ImportResult | null;
  replaceResult: ImportResult | null;
};

export function FileUploadForm({
  sutraId,
  rollId,
  sutraName,
  originalLanguage,
  translationLanguage,
  isSubmitting,
  navigationIntent,
  fileName,
  onFileChange,
  errorResult,
  replaceResult,
}: Props) {
  return (
    <Form method="post" className="space-y-4" encType="multipart/form-data">
      <input type="hidden" name="intent" value="preview" />
      <input type="hidden" name="sutraId" value={sutraId} />
      <input type="hidden" name="rollId" value={rollId} />
      <input type="hidden" name="sutraName" value={sutraName} />
      <input type="hidden" name="originalLanguage" value={originalLanguage} />
      <input type="hidden" name="translationLanguage" value={translationLanguage} />

      <div className="space-y-2">
        <Label htmlFor="file" className="text-lg text-primary">
          Data File *
        </Label>
        <div className="flex items-center gap-3">
          <Input
            required
            id="file"
            name="file"
            type="file"
            onChange={onFileChange}
            accept=".csv,.xlsx,.xls"
            className="flex-1 text-base"
          />
        </div>
        {fileName && (
          <p>
            <span className="text-lg text-muted-foreground">Selected: </span>
            <span className="text-base font-semibold text-foreground">{fileName}</span>
          </p>
        )}
      </div>

      {errorResult && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorResult.message}</AlertDescription>
        </Alert>
      )}

      {replaceResult && (
        <Alert variant={replaceResult.success ? 'default' : 'destructive'}>
          {replaceResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>
            <div className="space-y-2">
              <p>{replaceResult.message}</p>
              {replaceResult.errors && replaceResult.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    View errors ({replaceResult.errors.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {replaceResult.errors.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-3">
        <Button asChild type="button" variant="outline" className="text-base text-muted-foreground">
          <a href="/data">Cancel</a>
        </Button>
        <Button type="submit" className="text-base" disabled={isSubmitting}>
          {isSubmitting && navigationIntent === 'preview' ? 'Reading file...' : 'Preview Import'}
        </Button>
      </div>
    </Form>
  );
}
