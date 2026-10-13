export type TransactionStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type PackageType = 'digital' | 'digital+print';

export interface TransactionPackage {
  id: number;
  name: string;
  code: string; // 'regular' | 'vip'
  type: PackageType;
}

export interface TransactionFrame {
  id: string;
  name: string;
  category?: string;
}

export interface TransactionVoucher {
  code: string;
  discount: number;
}

export interface Transaction {
  id: string;
  sessionId: string;
  midtransOrderId: string;
  amount: number;
  status: TransactionStatus;
  qrisUrl?: string;
  qrisRawString?: string;
  paidAt?: string;
  createdAt: string;

  // Relational fields — joined by the backend
  package?: TransactionPackage;
  frame?: TransactionFrame;
  voucher?: TransactionVoucher;
}

export interface TransactionStats {
  total: number;
  totalChangePct: number; // % change vs yesterday
  revenue: number;
  revenueChangePct: number;
  successful: number;
  successfulChangePct: number;
  failed: number;
  failedChangePct: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
}

export interface TransactionResponse {
  data: Transaction[];
  meta: PaginationMeta;
}

// The backend joins the related package/frame rows and returns them nested
// inside the response.
export type BackendPackage = {
  id: number;
  name: string;
  code: string;
  type: PackageType;
};

export type BackendFrame = {
  id: string;
  name: string;
  category?: string;
};

export type BackendResponse = {
  id: string;
  session_id: string;
  midtrans_order_id: string;
  amount: number;
  status: TransactionStatus;
  qris_url?: string;
  qris_raw_string?: string;
  paid_at?: string;
  created_at: string;
  voucher?: TransactionVoucher | null;
  package?: BackendPackage | null;
  frame?: BackendFrame | null;
};

export const normalizeTransaction = (data: BackendResponse): Transaction => ({
  id: data.id,
  sessionId: data.session_id,
  midtransOrderId: data.midtrans_order_id,
  amount: data.amount,
  status: data.status,
  qrisUrl: data.qris_url,
  qrisRawString: data.qris_raw_string,
  paidAt: data.paid_at,
  createdAt: data.created_at,
  voucher: data.voucher ?? undefined,
  package: data.package ?? undefined,
  frame: data.frame ?? undefined,
});
