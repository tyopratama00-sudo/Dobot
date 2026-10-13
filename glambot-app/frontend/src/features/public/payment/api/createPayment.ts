import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MutationConfig } from '@/lib/react-query';

export interface CreatePaymentInput {
  sessionId: string;
}

interface Transaction {
  id: string;
  sessionId: string;
  midtransOrderId: string;
  amount: number;
  status: string;
  qrisUrl: string;
  qrisRawString: string;
  paidAt: string;
  createdAt: string;
}

interface Session {
  id: string;
  packageId: number;
  printCount: number;
  basePrice: number;
  voucherCode: string;
  discount: number;
  finalPrice: number;
  status: string;
  frameId: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string;
}

export interface CreatePaymentResult {
  session: Session;
  transaction: Transaction;
}

type BackendPaymentResponse = {
  transaction?: {
    id?: string;
    session_id?: string;
    sessionId?: string;
    midtrans_order_id?: string;
    midtransOrderId?: string;
    amount?: number;
    status?: string;
    qris_url?: string;
    qrisUrl?: string;
    qris_raw_string?: string;
    qrisRawString?: string;
    paid_at?: string | null;
    paidAt?: string | null;
    created_at?: string;
    createdAt?: string;
  };
  session?: {
    id?: string;
    package_id?: number;
    packageId?: number;
    print_count?: number;
    printCount?: number;
    price?: number;
    basePrice?: number;
    discount?: number;
    final_price?: number;
    finalPrice?: number;
    status?: string;
    frame_id?: string;
    frameId?: string;
    created_at?: string;
    createdAt?: string;
    expires_at?: string;
    expiresAt?: string;
    completed_at?: string | null;
    completedAt?: string | null;
  };
};

const normalizePaymentResponse = (
  response: BackendPaymentResponse,
): CreatePaymentResult => {
  const transaction = response.transaction ?? {};
  const session = response.session ?? {};

  return {
    transaction: {
      id: transaction.id ?? '',
      sessionId: transaction.session_id ?? transaction.sessionId ?? '',
      midtransOrderId:
        transaction.midtrans_order_id ?? transaction.midtransOrderId ?? '',
      amount: transaction.amount ?? 0,
      status: transaction.status ?? 'pending',
      qrisUrl: transaction.qris_url ?? transaction.qrisUrl ?? '',
      qrisRawString: transaction.qris_raw_string ?? transaction.qrisRawString ?? '',
      paidAt: transaction.paid_at ?? transaction.paidAt ?? '',
      createdAt: transaction.created_at ?? transaction.createdAt ?? '',
    },
    session: {
      id: session.id ?? '',
      packageId: session.package_id ?? session.packageId ?? 0,
      printCount: session.print_count ?? session.printCount ?? 0,
      basePrice: session.price ?? session.basePrice ?? 0,
      voucherCode: '',
      discount: session.discount ?? 0,
      finalPrice: session.final_price ?? session.finalPrice ?? 0,
      status: session.status ?? 'pending_payment',
      frameId: session.frame_id ?? session.frameId ?? '',
      createdAt: session.created_at ?? session.createdAt ?? '',
      expiresAt: session.expires_at ?? session.expiresAt ?? '',
      completedAt: session.completed_at ?? session.completedAt ?? '',
    },
  };
};

export const createPayment = async (
  data: CreatePaymentInput,
): Promise<CreatePaymentResult> => {
  const response = await apiClient.post<BackendPaymentResponse>(
    '/api/payment/create',
    {
      session_id: data.sessionId,
      sessionId: data.sessionId,
    },
  );
  return normalizePaymentResponse(response.data);
};

type UseCreatePaymentOptions = {
  mutationConfig?: MutationConfig<typeof createPayment>;
};

export const useCreatePayment = ({
  mutationConfig,
}: UseCreatePaymentOptions = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: createPayment,
  });
};
