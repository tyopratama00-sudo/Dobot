import { axiosInstance } from '@/lib/api-admin';
import { type LoginFormData } from '../forms/login';

export interface LoginResponse {
  token: string;
  admin: {
    email: string;
    name: string;
  };
}

export const login = async (data: LoginFormData): Promise<LoginResponse> => {
  const response = await axiosInstance.post('/api/admin/login', data);
  return response.data as unknown as LoginResponse;
};
