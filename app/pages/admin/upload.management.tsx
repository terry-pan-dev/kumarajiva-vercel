import type { ReadSutra, ReadRoll, ReadGlossary, ReadTeam } from '~/drizzle/tables';
import type { UploadReport } from '~/services/glossary.service';

import { GlossaryList } from '~/components/GlossaryList';
import { Icons } from '~/components/icons';
import { CallbackPaginationControls } from '~/components/PaginationControls';
import { ParagraphUploadList } from '~/components/ParagraphUploadList';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '~/components/ui';
import UploadActionButtons from '~/components/UploadActionButtons';

type SutraWithRolls = ReadSutra & {
  rolls?: (
    | ReadRoll
    | {
        id: string;
        title: string;
        subtitle: string;
        parentId: string | null;
        sutraId: string;
        createdAt: string;
        updatedAt: string;
        deletedAt: string | null;
        createdBy: string;
        updatedBy: string;
      }
  )[];
};

interface ParagraphUploadData {
  originSutra: string;
  targetSutra: string;
  references: {
    sutraName: string;
    content: string;
    order: string;
  }[];
}

interface UploadManagementProps {
  uploadResults: ReadGlossary[];
  paragraphUploadResults: ParagraphUploadData[];
  currentPage: number;
  totalPages: number;
  paginatedResults: ReadGlossary[];
  sutras: SutraWithRolls[];
  teams: ReadTeam[];
  uploadReport: UploadReport | null;
  onGlossaryUpload: (results: Record<string, any>[]) => void;
  onParagraphUpload: (results: Record<string, any>[]) => void;
  onUploadResults: () => void;
  onPageChange: (page: number) => void;
  onCancelUpload: () => void;
  isUploading?: boolean;
}

export function UploadManagement({
  uploadResults,
  paragraphUploadResults,
  currentPage,
  totalPages,
  paginatedResults,
  sutras,
  teams,
  uploadReport,
  onGlossaryUpload,
  onParagraphUpload,
  onUploadResults,
  onPageChange,
  onCancelUpload,
  isUploading = false,
}: UploadManagementProps) {
  if (uploadResults.length === 0 && paragraphUploadResults.length === 0 && !uploadReport) {
    return (
      <>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Upload Management</h2>
          <UploadActionButtons
            teams={teams}
            sutras={sutras}
            onGlossaryUpload={onGlossaryUpload}
            onParagraphUpload={onParagraphUpload}
          />
        </div>
        <div className="py-16 text-center">
          <p className="text-muted-foreground">
            No upload results to display. Use the upload button to process CSV files.
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Upload Management</h2>
        </div>
        <div className="flex items-center gap-4">
          {(uploadResults.length > 0 || paragraphUploadResults.length > 0) && (
            <p className="text-sm text-muted-foreground">
              {uploadResults.length > 0
                ? `Showing ${paginatedResults.length} of ${uploadResults.length} glossary entries`
                : `Showing ${paragraphUploadResults.length} paragraph entries`}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancelUpload} className="flex h-8 items-center gap-2">
              Cancel
            </Button>
            {(uploadResults.length > 0 || paragraphUploadResults.length > 0) && !uploadReport && (
              <Button disabled={isUploading} onClick={onUploadResults} className="flex h-8 items-center gap-2">
                <Icons.Upload className="h-4 w-4" />
                {isUploading ? 'Uploading...' : 'Upload to Database'}
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="h-2" role="presentation" />

      {/* Upload Report Section */}
      {uploadReport && (
        <div className="flex min-h-0 flex-1 flex-col">
          <Card className="flex h-full flex-1 flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
                <Icons.FileText className="h-6 w-6 text-slate-900" />
                Upload Report
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-blue-300 bg-blue-100 text-blue-900">
                    Total Attempted
                  </Badge>
                  <span className="text-lg font-bold text-blue-900">{uploadReport.totalAttempted}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-green-300 bg-green-100 text-green-900">
                    Successfully Uploaded
                  </Badge>
                  <span className="text-lg font-bold text-green-900">{uploadReport.totalInserted}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-red-300 bg-red-100 text-red-900">
                    Failed
                  </Badge>
                  <span className="text-lg font-bold text-red-900">{uploadReport.totalFailed}</span>
                </div>
              </div>

              {/* Failed Glossaries Section */}
              {uploadReport.failedGlossaries.length > 0 && (
                <div className="mt-4 flex min-h-0 flex-1 flex-col">
                  <Alert variant="destructive">
                    <Icons.X className="h-4 w-4" />
                    <AlertTitle>Failed Uploads (either UUID same or Chinese glossary already exists)</AlertTitle>
                    <AlertDescription>The following Chinese glossaries failed to upload:</AlertDescription>
                  </Alert>
                  <div className="mt-2 flex-1 overflow-y-auto rounded-md border p-2">
                    <div className="space-y-1">
                      {uploadReport.failedGlossaries.map((failed, index) => (
                        <div key={index} className="flex items-center justify-between rounded bg-red-50 p-2 text-sm">
                          <span className="font-medium text-red-900">{failed.glossary}</span>
                          <span className="text-red-700">{failed.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Algolia Errors Section */}
              {uploadReport.algoliaErrors.length > 0 && (
                <div className="mt-4">
                  <Alert variant="destructive">
                    <Icons.Search className="h-4 w-4" />
                    <AlertTitle>Search Index Errors</AlertTitle>
                    <AlertDescription>Some glossaries were uploaded but failed to index for search:</AlertDescription>
                  </Alert>
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-md border p-2">
                    <div className="space-y-1">
                      {uploadReport.algoliaErrors.map((error, index) => (
                        <div key={index} className="text-sm text-red-700">
                          {error}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Search ID Update Errors */}
              {uploadReport.searchIdUpdateErrors.length > 0 && (
                <div className="mt-4">
                  <Alert variant="destructive">
                    <Icons.SquarePen className="h-4 w-4" />
                    <AlertTitle>Search ID Update Errors</AlertTitle>
                    <AlertDescription>
                      Some glossaries were uploaded and indexed but failed to update search references:
                    </AlertDescription>
                  </Alert>
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-md border p-2">
                    <div className="space-y-1">
                      {uploadReport.searchIdUpdateErrors.map((error, index) => (
                        <div key={index} className="text-sm text-red-700">
                          {error}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {uploadReport.success && (
                <div className="mt-4">
                  <Alert>
                    <Icons.Check className="h-4 w-4" />
                    <AlertTitle>Success!</AlertTitle>
                    <AlertDescription>All glossaries were successfully uploaded and indexed.</AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Glossary List Section - Only show before upload is completed */}
      {uploadResults.length > 0 && !uploadReport && (
        <div className="flex-1 overflow-y-auto">
          <GlossaryList showEdit={false} glossaries={paginatedResults} />
        </div>
      )}

      {/* Paragraph Upload List Section - Only show before upload is completed */}
      {paragraphUploadResults.length > 0 && !uploadReport && (
        <div className="flex-1 overflow-y-auto">
          <ParagraphUploadList paragraphs={paragraphUploadResults} />
        </div>
      )}

      {totalPages > 1 && !uploadReport && uploadResults.length > 0 && (
        <CallbackPaginationControls totalPages={totalPages} currentPage={currentPage} onPageChange={onPageChange} />
      )}
    </div>
  );
}
