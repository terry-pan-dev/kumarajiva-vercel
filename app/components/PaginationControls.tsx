import { Link } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from './ui/pagination';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  className?: string;
  // For URL-based pagination (Remix routes)
  onPageChange?: never;
  basePath?: string;
}

interface CallbackPaginationControlsProps {
  currentPage: number;
  totalPages: number;
  className?: string;
  // For callback-based pagination (state management)
  onPageChange: (page: number) => void;
  basePath?: never;
}

const generatePages = (currentPage: number, totalPages: number) => {
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

// URL-based pagination for Remix routes
export function UrlPaginationControls({
  currentPage,
  totalPages,
  basePath = '',
  className = 'h-10',
}: PaginationControlsProps) {
  const pages = generatePages(currentPage, totalPages);

  return (
    <ClientOnly fallback={<div className={className} />}>
      {() => (
        <Pagination>
          <PaginationContent className={className}>
            <PaginationItem>
              {currentPage === 1 ? (
                <span className="pointer-events-none select-none opacity-50">
                  <PaginationPrevious to={'#'}>Previous</PaginationPrevious>
                </span>
              ) : (
                <PaginationPrevious to={`${basePath}?page=${currentPage - 1}`} />
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
                  <Link className="mx-1" to={`${basePath}?page=${p}`}>
                    {p}
                  </Link>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              {currentPage >= totalPages ? (
                <span className="pointer-events-none select-none opacity-50">
                  <PaginationNext to={'#'}>Next</PaginationNext>
                </span>
              ) : (
                <PaginationNext to={`${basePath}?page=${currentPage + 1}`} />
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </ClientOnly>
  );
}

// Callback-based pagination for state management
export function CallbackPaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  className = 'h-8',
}: CallbackPaginationControlsProps) {
  const pages = generatePages(currentPage, totalPages);

  return (
    <Pagination>
      <PaginationContent className={className}>
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
}
