'use client';

import * as React from 'react';
import { useDebouncedSearch } from '@/lib/useDebouncedSearch';
import { Search, Loader2, Calendar } from 'lucide-react';
import { Input } from '@/components/admin/ui/input';
import {
  FilterSelect,
  MONTH_FILTER_OPTIONS,
} from '@/components/admin/shared/FilterSelect';

type TransactionFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  month: string;
  onMonthChange: (value: string) => void;
};

export function TransactionFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  month,
  onMonthChange,
}: TransactionFiltersProps) {
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
          placeholder="Search transaction ID..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="h-9 rounded-[8px] pl-9 text-sm"
          aria-label="Search transactions"
        />
      </div>

      <FilterSelect
        value={status}
        onChange={onStatusChange}
        placeholder="Payment Status"
        ariaLabel="Filter by payment status"
        widthClass="w-40"
        options={[
          { value: 'all', label: 'Payment Status' },
          { value: 'success', label: 'Success' },
          { value: 'pending', label: 'Pending' },
          { value: 'failed', label: 'Failed' },
          { value: 'expired', label: 'Expired' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
      />

      <FilterSelect
        value={month}
        onChange={onMonthChange}
        placeholder="Month"
        ariaLabel="Filter by month"
        options={MONTH_FILTER_OPTIONS}
        icon={<Calendar className="size-4 opacity-50" />}
      />
    </div>
  );
}
