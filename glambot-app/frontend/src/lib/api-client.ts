import axios, { AxiosError } from 'axios';

export interface ApiError {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}

/**
 * URL service dari env, dengan koreksi LAN: kalau env menunjuk localhost tapi
 * halaman dibuka dari LAN IP, host diturunkan dari halaman supaya satu build
 * jalan di PC kiosk maupun HP. Env non-lokal dihormati apa adanya; SSR /
 * tanpa env jatuh ke localhost.
 */
const resolveServiceUrl = (rawEnvUrl: string | undefined, port: number): string => {
  const envUrl = rawEnvUrl?.trim();

  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    const onLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';
    const derived = `${window.location.protocol}//${currentHost}:${port}`;

    if (envUrl) {
      const envIsLocal = /localhost|127\.0\.0\.1/.test(envUrl);
      return envIsLocal && !onLocalhost ? derived : envUrl;
    }
    return derived;
  }

  return envUrl || `http://localhost:${port}`;
};

/** Base URL backend Go (:8080). */
export const resolveBaseUrl = (): string =>
  resolveServiceUrl(process.env.NEXT_PUBLIC_API_URL, 8080);

/** URL service dobot (Flask :5001) untuk panel Face Detection. */
export const resolveRobotUrl = (): string =>
  resolveServiceUrl(process.env.NEXT_PUBLIC_ROBOT_URL, 5001);

export const apiClient = axios.create({
  baseURL: resolveBaseUrl(),
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = resolveBaseUrl();
  return config;
});

/** Jadikan URL relatif (mis. `/storage/...`) absolut; yang sudah absolut lewat. */
export const toAbsoluteUrl = (path: string): string =>
  path.startsWith('http') ? path : `${resolveBaseUrl()}${path}`;

apiClient.interceptors.response.use(
  (response) => {
    const body: unknown = response.data;
    if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
      response.data = (body as { data: unknown }).data;
    }
    return response;
  },
  (error: AxiosError) => {
    const apiError: ApiError = {
      message:
        (error.response?.data as { message?: string })?.message ??
        error.message ??
        'An unexpected error occurred',
      statusCode: error.response?.status ?? 0,
      errors: (error.response?.data as { errors?: Record<string, string[]> })
        ?.errors,
    };
    return Promise.reject(apiError);
  },
);
