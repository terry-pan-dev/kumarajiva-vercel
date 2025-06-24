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

interface BasePaginationProps {
  currentPage: number;
  totalPages: number;
  className?: string;
}

interface UrlPaginationProps extends BasePaginationProps {
  // For URL-based pagination (Remix routes)
  onPageChange?: never;
  basePath?: string;
}

interface CallbackPaginationProps extends BasePaginationProps {
  // For callback-based pagination (state management)
  onPageChange: (page: number) => void;
  basePath?: never;
}

type PaginationControlsProps = UrlPaginationProps | CallbackPaginationProps;

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

export function PaginationControls({ currentPage, totalPages, className = 'h-10', ...props }: PaginationControlsProps) {
  const pages = generatePages(currentPage, totalPages);
  const isUrlBased = !('onPageChange' in props);
  const basePath = isUrlBased ? props.basePath || '' : '';
  const onPageChange = !isUrlBased ? props.onPageChange : undefined;

  const renderPageButton = (page: number) => {
    if (isUrlBased) {
      return (
        <Link className="mx-1" to={`${basePath}?page=${page}`}>
          {page}
        </Link>
      );
    } else {
      return (
        <button onClick={() => onPageChange?.(page)} className="mx-1 rounded px-2 py-1 hover:bg-muted">
          {page}
        </button>
      );
    }
  };

  const renderPreviousButton = () => {
    if (currentPage === 1) {
      return (
        <span className="pointer-events-none select-none opacity-50">
          <PaginationPrevious to="#">Previous</PaginationPrevious>
        </span>
      );
    }

    if (isUrlBased) {
      return <PaginationPrevious to={`${basePath}?page=${currentPage - 1}`} />;
    } else {
      return (
        <button onClick={() => onPageChange?.(currentPage - 1)}>
          <PaginationPrevious to="#">Previous</PaginationPrevious>
        </button>
      );
    }
  };

  const renderNextButton = () => {
    if (currentPage >= totalPages) {
      return (
        <span className="pointer-events-none select-none opacity-50">
          <PaginationNext to="#">Next</PaginationNext>
        </span>
      );
    }

    if (isUrlBased) {
      return <PaginationNext to={`${basePath}?page=${currentPage + 1}`} />;
    } else {
      return (
        <button onClick={() => onPageChange?.(currentPage + 1)}>
          <PaginationNext to="#">Next</PaginationNext>
        </button>
      );
    }
  };

  const paginationContent = (
    <Pagination>
      <PaginationContent className={className}>
        <PaginationItem>{renderPreviousButton()}</PaginationItem>
        {pages.map((p, idx) => (
          <PaginationItem key={idx}>
            {p === 'ellipsis' ? (
              <span className="flex items-center justify-center rounded py-1 text-muted-foreground">
                <PaginationEllipsis />
              </span>
            ) : p === currentPage ? (
              <span className="rounded border px-2 py-1 text-muted-foreground">{p}</span>
            ) : (
              renderPageButton(p as number)
            )}
          </PaginationItem>
        ))}
        <PaginationItem>{renderNextButton()}</PaginationItem>
      </PaginationContent>
    </Pagination>
  );

  // Only wrap in ClientOnly for URL-based pagination (Remix routes need SSR handling)
  if (isUrlBased) {
    return <ClientOnly fallback={<div className={className} />}>{() => paginationContent}</ClientOnly>;
  }

  return paginationContent;
}

// Export legacy components for backward compatibility
export const UrlPaginationControls = PaginationControls;
export const CallbackPaginationControls = PaginationControls;
