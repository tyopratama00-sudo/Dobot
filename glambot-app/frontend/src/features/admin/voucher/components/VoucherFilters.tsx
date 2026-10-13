'use client';

import * as React from 'react';
import { useDebouncedSearch } from '@/lib/useDebouncedSearch';
import { Search, Loader2, Calendar } from 'lucide-react';
import { Input } from '@/components/admin/ui/input';
import {
  FilterSelect,
  MONTH_FILTER_OPTIONS,
} from '@/components/admin/shared/FilterSelect';

type VoucherFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  discountType: string;
  onDiscountTypeChange: (value: string) => void;
  month: string;
  onMonthChange: (value: string) => void;
};

export function VoucherFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  discountType,
  onDiscountTypeChange,
  month,
  onMonthChange,
}: VoucherFiltersProps) {
  const { localSearch, setLocalSearch, isSearchPending } = useDebouncedSearch(
    search,
    onSearchChange,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-48 shrink-0">
        {isSearchPending ? (
          <Loader2 className="text-muted-foreground absolute top-2.5 left-3 size-4 animate-spin" />
        ) : (
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
        )}
        <Input
          placeholder="Search code..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="h-9 pl-9 text-sm rounded-[8px]"
          aria-label="Search vouchers"
        />
      </div>

      <FilterSelect
        value={status}
        onChange={onStatusChange}
        placeholder="Status"
        options={[
          { value: 'all', label: 'Status' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'expired', label: 'Expired' },
        ]}
      />

      <FilterSelect
        value={discountType}
        onChange={onDiscountTypeChange}
        placeholder="Types"
        widthClass="w-40"
        options={[
          { value: 'all', label: 'Types' },
          { value: 'percentage', label: 'Percentage' },
          { value: 'fixed', label: 'Fixed Amount' },
        ]}
      />

      <FilterSelect
        value={month}
        onChange={onMonthChange}
        placeholder="Month"
        options={MONTH_FILTER_OPTIONS}
        icon={<Calendar className="size-4 opacity-50" />}
      />
    </div>
  );
}
