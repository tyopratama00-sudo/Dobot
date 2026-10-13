import axios, { AxiosError } from 'axios';
import { resolveBaseUrl } from './api-client';

// Token admin disimpan ganda: localStorage (dibaca interceptor axios) dan
// cookie (dibaca route guard server-side, yang tak bisa akses localStorage).
// Nama cookie HARUS sama dengan yang dicek di proxy.ts.
export const ADMIN_TOKEN_KEY = 'admin_token';
export const ADMIN_USER_KEY = 'admin_user';

// 24 jam (samakan dengan masa berlaku token di backend).
const TOKEN_MAX_AGE = 60 * 60 * 24;

export interface AdminUser {
  email: string;
  name: string;
}

export const setAdminToken = (token: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  document.cookie = `${ADMIN_TOKEN_KEY}=${token}; path=/; max-age=${TOKEN_MAX_AGE}; samesite=lax`;
};

export const setAdminUser = (user: AdminUser) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
};

export const getAdminUser = (): AdminUser | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ADMIN_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
};

export const clearAdminToken = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_USER_KEY);
  document.cookie = `${ADMIN_TOKEN_KEY}=; path=/; max-age=0; samesite=lax`;
};

export const axiosInstance = axios.create({
  // baseURL diresolusi ulang per-request lewat interceptor (LAN-aware). Nilai
  // awal ini hanya default SSR/first-tick.
  baseURL: resolveBaseUrl(),
  withCredentials: false,
});

// Sisipkan Bearer token (disimpan saat login) ke setiap request admin, dan
// resolusi baseURL yang sama dengan apiClient publik supaya panel admin yang
// dibuka dari LAN IP tidak menembak "localhost"/"undefined".
axiosInstance.interceptors.request.use((config) => {
  config.baseURL = resolveBaseUrl();
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Token invalid/expired → bersihkan sesi & arahkan ke login.
    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined'
    ) {
      clearAdminToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    const message =
      (error.response?.data as { message?: string })?.message ??
      error.message ??
      'An error occurred. Please try again.';
    const apiError = new Error(message);
    Object.assign(apiError, {
      response: error.response,
      statusCode: error.response?.status ?? 0,
      errors: (error.response?.data as { errors?: Record<string, string[]> })
        ?.errors,
    });
    return Promise.reject(apiError);
  },
);
