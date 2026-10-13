'use client';

import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: FilterOption[];
  /** Lebar trigger, mis. 'w-36'. Sisa kelasnya sama untuk semua filter. */
  widthClass?: string;
  ariaLabel?: string;
  /** Ikon kecil di kiri nilai (dipakai filter bulan). */
  icon?: ReactNode;
}

/**
 * Dropdown filter pada toolbar daftar admin. Sebelumnya markup Select yang
 * sama ditulis ulang di tiap halaman (frame, paket, voucher, transaksi);
 * yang berbeda cuma daftar opsi, lebar, dan label aksesibilitasnya.
 */
export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  widthClass = 'w-36',
  ariaLabel,
  icon,
}: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn('h-9 rounded-[8px] text-sm', widthClass)}
        aria-label={ariaLabel}
      >
        {icon ? (
          <div className="flex items-center gap-2">
            {icon}
            <SelectValue placeholder={placeholder} />
          </div>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-sm">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Opsi filter bulan — dipakai halaman voucher & transaksi. */
export const MONTH_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'Month' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];
