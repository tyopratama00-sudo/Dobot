import { formatRupiah } from '@/lib/formats';
import { DiscountType } from '../api/types';

// Voucher memakai gaya "Rp 45.000" (spasi biasa), bukan formatIDR yang memakai
// non-breaking space bawaan Intl currency — angka tetap dari sumber yang sama.
export const formatCurrency = (value: number): string =>
  `Rp ${formatRupiah(value)}`;

export const formatDiscount = (value: number, type: DiscountType): string =>
  type === 'percentage' ? `${value}%` : formatCurrency(value);
