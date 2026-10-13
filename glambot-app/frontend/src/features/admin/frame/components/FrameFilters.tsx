'use client';

import * as React from 'react';
import { useDebouncedSearch } from '@/lib/useDebouncedSearch';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/admin/ui/input';
import { FilterSelect } from '@/components/admin/shared/FilterSelect';
import { type FrameCategory } from '../api/types';


type FrameFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  categoryOptions: FrameCategory[];
};

export function FrameFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  category,
  onCategoryChange,
  categoryOptions,
}: FrameFiltersProps) {
  const { localSearch, setLocalSearch, isSearchPending } = useDebouncedSearch(
    search,
    onSearchChange,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-52 shrink-0">
        {isSearchPending ? (
          <Loader2 className="text-muted-foreground absolute top-2.5 left-3 size-4 animate-spin" />
        ) : (
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
        )}
        <Input
          placeholder="Search frame name or code..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="h-9 pl-9 text-sm rounded-[8px]"
          aria-label="Search frames"
        />
      </div>

      <FilterSelect
        value={status}
        onChange={onStatusChange}
        placeholder="Status"
        ariaLabel="Filter by status"
        options={[
          { value: 'all', label: 'Status' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
      />

      <FilterSelect
        value={category}
        onChange={onCategoryChange}
        placeholder="Category"
        ariaLabel="Filter by category"
        widthClass="w-40"
        options={[
          { value: 'all', label: 'Category' },
          ...categoryOptions.map((cat) => ({ value: cat, label: cat })),
        ]}
      />
    </div>
  );
}
