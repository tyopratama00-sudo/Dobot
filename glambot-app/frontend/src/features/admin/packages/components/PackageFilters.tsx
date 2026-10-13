'use client';

import * as React from 'react';
import { useDebouncedSearch } from '@/lib/useDebouncedSearch';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/admin/ui/input';
import { FilterSelect } from '@/components/admin/shared/FilterSelect';

type PackageFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
};

export function PackageFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  code,
  onCodeChange,
}: PackageFiltersProps) {
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
          placeholder="Search package name..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="h-9 pl-9 text-sm rounded-[8px]"
          aria-label="Search packages"
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
          { value: 'draft', label: 'Draft' },
        ]}
      />

      <FilterSelect
        value={code}
        onChange={onCodeChange}
        placeholder="Types"
        ariaLabel="Filter by package type"
        widthClass="w-44"
        options={[
          { value: 'all', label: 'Types' },
          { value: 'regular', label: 'Regular (Digital)' },
          { value: 'vip', label: 'VIP (Print + Digital)' },
        ]}
      />
    </div>
  );
}
