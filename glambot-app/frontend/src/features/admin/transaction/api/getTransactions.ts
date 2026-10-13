import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import {
  type TransactionResponse,
  type BackendResponse,
  type TransactionStatus,
  normalizeTransaction,
} from './types';

export type GetTransactionsInput = {
  page?: number;
  limit?: number;
  search?: string;
  status?: TransactionStatus | 'all';
  month?: number | 'all';
  sortBy?: 'createdAt' | 'amount' | 'status';
  sortOrder?: 'asc' | 'desc';
};

export const getTransactions = async (
  input?: GetTransactionsInput,
): Promise<TransactionResponse> => {
  const response = await axiosInstance.get('/api/admin/transactions', {
    params: input,
  });
  const payload = response.data as unknown as {
    data: BackendResponse[];
    meta: TransactionResponse['meta'];
  };

  return {
    data: (payload.data ?? []).map(normalizeTransaction),
    meta: payload.meta ?? { total: 0, page: 1, lastPage: 1 },
  };
};

export const getTransactionsQueryKey = (input?: GetTransactionsInput) => {
  if (!input) return ['transactions'] as const;
  return ['transactions', input] as const;
};

export const getTransactionsQueryOptions = (input?: GetTransactionsInput) => {
  return queryOptions({
    queryKey: getTransactionsQueryKey(input),
    queryFn: () => getTransactions(input),
    // Auto-refresh: poll daftar transaksi tiap 15s + saat tab kembali fokus,
    // jadi transaksi baru yang masuk muncul otomatis tanpa refresh manual.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};

type UseGetTransactionsParams = {
  queryConfig?: QueryConfig<typeof getTransactionsQueryOptions>;
  input?: GetTransactionsInput;
};

export const useGetTransactions = ({
  queryConfig,
  input,
}: UseGetTransactionsParams = {}) => {
  return useQuery({
    ...getTransactionsQueryOptions(input),
    ...queryConfig,
  });
};
