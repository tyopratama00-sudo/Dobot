import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MutationConfig, QueryConfig } from '@/lib/react-query';

type BackendSessionShape = {
  id?: string;
  sessionId?: string;
  package_id?: number;
  packageId?: number;
  package_code?: string;
  packageCode?: string;
  duration_secs?: number;
  durationSecs?: number;
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
  packageTitle?: string;
};

type BackendSessionStatusShape = BackendSessionShape & {
  session_id?: string;
};

const packageTitleByCode: Record<string, string> = {
  regular: 'Regular',
  vip: 'VIP',
};

const getPrintUnitPrice = (packageCode: string) => {
  switch (packageCode) {
    case 'vip':
      return 15000;
    default:
      return 0;
  }
};

const normalizeSession = (
  session: BackendSessionShape,
): SessionDetailResponse => {
  const packageCode = session.package_code ?? session.packageCode ?? '';
  const packageTitle = packageTitleByCode[packageCode] ?? packageCode;
  const price = session.price ?? session.basePrice ?? 0;
  const finalPrice = session.final_price ?? session.finalPrice ?? price;
  const printCount = session.print_count ?? session.printCount ?? 0;
  const extraPrintCost = printCount * getPrintUnitPrice(packageCode);

  return {
    id: session.id ?? session.sessionId ?? '',
    packageId: session.package_id ?? session.packageId ?? 0,
    packageCode,
    packageTitle: session.packageTitle ?? packageTitle,
    durationSecs: session.duration_secs ?? session.durationSecs ?? 300,
    printCount,
    basePrice: price,
    extraPrintCost,
    voucherCode: '',
    discount: session.discount ?? 0,
    finalPrice,
    status: (session.status ??
      'pending_payment') as SessionDetailResponse['status'],
    createdAt: session.created_at ?? session.createdAt ?? '',
    expiresAt: session.expires_at ?? session.expiresAt ?? '',
  };
};

const normalizeCreateSessionResponse = (
  session: BackendSessionShape,
): SessionResponse => ({
  sessionId: session.id ?? session.sessionId ?? '',
  packageId: session.package_id ?? session.packageId ?? 0,
  printCount: session.print_count ?? session.printCount ?? 0,
  basePrice: session.price ?? session.basePrice ?? 0,
  finalPrice:
    session.final_price ??
    session.finalPrice ??
    session.price ??
    session.basePrice ??
    0,
  status: (session.status ?? 'pending_payment') as SessionResponse['status'],
});

// --- Types ---

export interface CreateSessionInput {
  packageId: number;
  printCount: number;
}

export interface SessionResponse {
  sessionId: string;
  packageId: number;
  printCount: number;
  basePrice: number;
  finalPrice: number;
  status: 'pending_payment' | 'paid' | 'shooting' | 'completed' | 'expired';
}

export interface SessionDetailResponse {
  id: string;
  packageId: number;
  packageCode: string;
  packageTitle: string;
  durationSecs: number;
  printCount: number;
  basePrice: number;
  extraPrintCost: number;
  voucherCode: string;
  discount: number;
  finalPrice: number;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export interface PatchSessionInput {
  sessionId: string;
  status: 'pending_payment' | 'paid' | 'shooting' | 'completed' | 'expired';
}

// --- API functions ---

export const createSession = async (
  input: CreateSessionInput,
): Promise<SessionResponse> => {
  try {
    const response = await apiClient.post<SessionResponse>(
      '/api/session/create',
      input,
    );
    return normalizeCreateSessionResponse(
      response.data as unknown as BackendSessionShape,
    );
  } catch (error) {
    const apiError = error as { statusCode?: number };
    if (apiError.statusCode !== 404) {
      throw error;
    }

    const fallbackResponse = await apiClient.post<SessionResponse>(
      '/api/session',
      input,
    );
    return normalizeCreateSessionResponse(
      fallbackResponse.data as unknown as BackendSessionShape,
    );
  }
};

export const getSession = async (
  sessionId: string,
): Promise<SessionDetailResponse> => {
  try {
    const response = await apiClient.get<SessionDetailResponse>(
      `/api/session/${sessionId}`,
    );
    return normalizeSession(response.data as unknown as BackendSessionShape);
  } catch (error) {
    const apiError = error as { statusCode?: number };
    if (apiError.statusCode !== 404) {
      throw error;
    }

    const fallbackResponse = await apiClient.get<SessionDetailResponse>(
      `/api/session/create/${sessionId}`,
    );
    return normalizeSession(
      fallbackResponse.data as unknown as BackendSessionShape,
    );
  }
};

export const patchSessionStatus = async ({
  sessionId,
  status,
}: PatchSessionInput): Promise<SessionDetailResponse> => {
  try {
    const response = await apiClient.patch<SessionDetailResponse>(
      `/api/session/${sessionId}/status`,
      { status },
    );
    return normalizeSession(
      response.data as unknown as BackendSessionStatusShape,
    );
  } catch (error) {
    const apiError = error as { statusCode?: number };
    if (apiError.statusCode !== 404) {
      throw error;
    }

    const fallbackResponse = await apiClient.patch<SessionDetailResponse>(
      `/api/session/create/${sessionId}/status`,
      { status },
    );
    return normalizeSession(
      fallbackResponse.data as unknown as BackendSessionStatusShape,
    );
  }
};

// --- React Query hooks ---

type UseCreateSessionOptions = {
  mutationConfig?: MutationConfig<typeof createSession>;
};

export const useCreateSession = ({
  mutationConfig,
}: UseCreateSessionOptions = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: createSession,
  });
};

export const getSessionQueryOptions = (sessionId: string) => ({
  queryKey: ['session', sessionId],
  queryFn: () => getSession(sessionId),
});

type UseGetSessionOptions = {
  sessionId: string;
  queryConfig?: QueryConfig<typeof getSessionQueryOptions>;
};

export const useGetSession = ({
  sessionId,
  queryConfig,
}: UseGetSessionOptions) => {
  return useQuery({
    ...getSessionQueryOptions(sessionId),
    ...queryConfig,
  });
};

type UsePatchSessionStatusOptions = {
  mutationConfig?: MutationConfig<typeof patchSessionStatus>;
};

export const usePatchSessionStatus = ({
  mutationConfig,
}: UsePatchSessionStatusOptions = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...mutationConfig,
    mutationFn: patchSessionStatus,
    onSuccess: (data, variables, onMutateResult, context) => {
      // MERGE status saja ke cache ['session', id] — respons PATCH cuma berisi
      // {session_id, status}, kalau ditimpa penuh field lain (packageCode,
      // harga) hilang. Tanpa ini /instruction sempat baca status basi.
      queryClient.setQueryData<SessionDetailResponse>(
        ['session', variables.sessionId],
        (old) => (old ? { ...old, status: data.status } : old),
      );
      mutationConfig?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
};
