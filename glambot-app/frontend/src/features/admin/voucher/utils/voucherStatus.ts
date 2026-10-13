import { Voucher } from '../api/types';

const isVoucherExpired = (voucher: Voucher, now?: number): boolean => {
  if (!voucher.expiresAt) return false;
  if (now === undefined) return false;
  return now > new Date(voucher.expiresAt).getTime();
};

export type DerivedVoucherStatus = 'active' | 'inactive' | 'expired';

export const getDerivedStatus = (
  voucher: Voucher,
  now?: number,
): DerivedVoucherStatus => {
  if (!voucher.isActive) return 'inactive';
  if (isVoucherExpired(voucher, now)) return 'expired';
  return 'active';
};

