import { GlossaryList } from '~/components/GlossaryList';
import { Icons } from '~/components/icons';
import { CallbackPaginationControls } from '~/components/PaginationControls';
import { Button } from '~/components/ui';
import UploadActionButtons from '~/components/UploadActionButtons';

interface UploadManagementProps {
  uploadResults: Record<string, any>[];
  currentPage: number;
  totalPages: number;
  paginatedResults: any[];
  onGlossaryUpload: (results: Record<string, any>[]) => void;
  onUploadResults: () => void;
  onPageChange: (page: number) => void;
  onCancelUpload: () => void;
  isUploading?: boolean;
}

export function UploadManagement({
  uploadResults,
  currentPage,
  totalPages,
  paginatedResults,
  onGlossaryUpload,
  onUploadResults,
  onPageChange,
  onCancelUpload,
  isUploading = false,
}: UploadManagementProps) {
  if (uploadResults.length === 0) {
    return (
      <>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Upload Management</h2>
          <UploadActionButtons onGlossaryUpload={onGlossaryUpload} />
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
    <>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Upload Management</h2>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {paginatedResults.length} of {uploadResults.length} entries
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancelUpload} className="flex h-8 items-center gap-2">
              Cancel
            </Button>
            <Button disabled={isUploading} onClick={onUploadResults} className="flex h-8 items-center gap-2">
              <Icons.Upload className="h-4 w-4" />
              {isUploading ? 'Uploading...' : 'Upload to Database'}
            </Button>
          </div>
        </div>
      </div>
      <div className="h-2" role="presentation" />

      <div className="flex-1 overflow-y-auto">
        <GlossaryList showEdit={false} glossaries={paginatedResults} />
      </div>

      {totalPages > 1 && (
        <CallbackPaginationControls totalPages={totalPages} currentPage={currentPage} onPageChange={onPageChange} />
      )}
    </>
  );
}
