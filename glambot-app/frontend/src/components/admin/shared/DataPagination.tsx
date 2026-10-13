'use client';

import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/admin/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50];

type DataPaginationProps = {
  /** Total number of items across all pages */
  total: number;
  /** Current 1-based page */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Current page size */
  pageSize: number;
  /** Called when the user navigates to a different page */
  onPageChange: (page: number) => void;
  /** Called when the user changes the page size */
  onPageSizeChange: (pageSize: number) => void;
  /** Item label used for empty / Showing X of Y copy. Defaults to "items" */
  itemLabel?: string;
  /** Page size options shown in the select. Defaults to [10, 25, 50] */
  pageSizeOptions?: number[];
};

export function DataPagination({
  total,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'items',
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataPaginationProps) {
  const startIndex = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, total);
  const paginationItems = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <span className="text-muted-foreground text-sm">
        {total === 0
          ? `No ${itemLabel} found`
          : `Showing ${startIndex}–${endIndex} of ${total} ${itemLabel}`}
      </span>

      {total > 0 && (
        <Pagination className="w-full justify-center sm:col-start-2">
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                href="#"
                size="icon-sm"
                onClick={(e) => {
                  e.preventDefault();
                  onPageChange(Math.max(1, currentPage - 1));
                }}
                className="cursor-pointer rounded-md"
                aria-disabled={currentPage === 1}
                aria-label="Previous page"
                tabIndex={currentPage === 1 ? -1 : 0}
              >
                <ChevronLeftIcon className="size-4" />
              </PaginationLink>
            </PaginationItem>
            {paginationItems.map((item) => (
              <PaginationItem key={item}>
                <PaginationLink
                  href="#"
                  isActive={currentPage === item}
                  size="icon-sm"
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(item);
                  }}
                  className="cursor-pointer rounded-md"
                  aria-label={`Page ${item}`}
                  aria-current={currentPage === item ? 'page' : undefined}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationLink
                href="#"
                size="icon-sm"
                onClick={(e) => {
                  e.preventDefault();
                  onPageChange(Math.min(totalPages, currentPage + 1));
                }}
                className="cursor-pointer rounded-md"
                aria-disabled={currentPage === totalPages}
                aria-label="Next page"
                tabIndex={currentPage === totalPages ? -1 : 0}
              >
                <ChevronRightIcon className="size-4" />
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <div className="flex items-center gap-2 sm:justify-end">
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger className="h-8 w-36 rounded-[8px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-sm">
                {n}/Page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
