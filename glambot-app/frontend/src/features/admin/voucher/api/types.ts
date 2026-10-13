export type DiscountType = 'percentage' | 'fixed';

export type VoucherStatusFilter = 'active' | 'inactive' | 'expired' | 'all';

export interface Voucher {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  minPrice: number;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface VoucherStats {
  total: number;
  active: number;
  inactive: number;
  expired: number;
  totalUsed: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
}

export interface VoucherResponse {
  data: Voucher[];
  meta: PaginationMeta;
}

export type BackendResponse = {
  code: string;
  description: string;
  discount_type: DiscountType;
  discount_value: number;
  min_price: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
};

export const normalizeVoucher = (data: BackendResponse): Voucher => ({
  code: data.code,
  description: data.description ?? '',
  discountType: data.discount_type,
  discountValue: data.discount_value,
  minPrice: data.min_price ?? 0,
  maxUses: data.max_uses ?? 0,
  usedCount: data.used_count ?? 0,
  isActive: data.is_active,
  expiresAt: data.expires_at,
  createdAt: data.created_at,
});
