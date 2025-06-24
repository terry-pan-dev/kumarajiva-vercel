import { GlossaryList } from './GlossaryList';
import { Icons } from './icons';
import { Button } from './ui';
import {
  Pagination,
  PaginationPrevious,
  PaginationItem,
  PaginationContent,
  PaginationNext,
  PaginationEllipsis,
} from './ui/pagination';
import UploadActionButtons from './UploadActionButtons';

interface UploadTabProps {
  uploadResults: Record<string, any>[];
  currentPage: number;
  totalPages: number;
  paginatedResults: any[];
  onGlossaryUpload: (results: Record<string, any>[]) => void;
  onUploadResults: () => void;
  onPageChange: (page: number) => void;
}

interface UploadResultsPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const UploadResultsPagination = ({ currentPage, totalPages, onPageChange }: UploadResultsPaginationProps) => {
  const getPages = () => {
    const pages = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    if (currentPage === 1 || currentPage === 2) {
      pages.push(1, 2, 3);
      if (totalPages > 4) pages.push('ellipsis');
      pages.push(totalPages);
    } else if (currentPage === 3) {
      pages.push(1, 2, 3, 4, 'ellipsis', totalPages);
    } else if (currentPage === 4) {
      pages.push(1, 'ellipsis', 3, 4, 5, 'ellipsis', totalPages);
    } else if (currentPage > 4 && currentPage < totalPages - 2) {
      pages.push(1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages);
    } else {
      // Near the end
      pages.push(1, 'ellipsis');
      for (let i = totalPages - 2; i <= totalPages; i++) pages.push(i);
    }
    return pages;
  };

  const pages = getPages();

  return (
    <Pagination>
      <PaginationContent className="h-8">
        <PaginationItem>
          {currentPage === 1 ? (
            <span className="pointer-events-none select-none opacity-50">
              <PaginationPrevious to="#">Previous</PaginationPrevious>
            </span>
          ) : (
            <button onClick={() => onPageChange(currentPage - 1)}>
              <PaginationPrevious to="#">Previous</PaginationPrevious>
            </button>
          )}
        </PaginationItem>
        {pages.map((p, idx) => (
          <PaginationItem key={idx}>
            {p === 'ellipsis' ? (
              <span className="flex items-center justify-center rounded py-1 text-muted-foreground">
                <PaginationEllipsis />
              </span>
            ) : p === currentPage ? (
              <span className="rounded border px-2 py-1 text-muted-foreground">{p}</span>
            ) : (
              <button onClick={() => onPageChange(p as number)} className="mx-1 rounded px-2 py-1 hover:bg-muted">
                {p}
              </button>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          {currentPage >= totalPages ? (
            <span className="pointer-events-none select-none opacity-50">
              <PaginationNext to="#">Next</PaginationNext>
            </span>
          ) : (
            <button onClick={() => onPageChange(currentPage + 1)}>
              <PaginationNext to="#">Next</PaginationNext>
            </button>
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};

export function UploadTab({
  uploadResults,
  currentPage,
  totalPages,
  paginatedResults,
  onGlossaryUpload,
  onUploadResults,
  onPageChange,
}: UploadTabProps) {
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
          <Button onClick={onUploadResults} className="flex h-8 items-center gap-2">
            <Icons.Upload className="h-4 w-4" />
            Upload to Database
          </Button>
        </div>
      </div>
      <div className="h-2" role="presentation" />

      <div className="flex-1 overflow-y-auto">
        <GlossaryList showEdit={false} glossaries={paginatedResults} />
      </div>

      {totalPages > 1 && (
        <UploadResultsPagination totalPages={totalPages} currentPage={currentPage} onPageChange={onPageChange} />
      )}
    </>
  );
}
