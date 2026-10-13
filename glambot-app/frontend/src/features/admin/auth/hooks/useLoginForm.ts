import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { loginSchema, LoginFormData } from '../forms/login';
import { login } from '../api/login';
import { setAdminToken, setAdminUser } from '@/lib/api-admin';

export const useLoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const handleLogin = async (data: LoginFormData) => {
    try {
      const result = await login(data);
      setAdminToken(result.token);
      setAdminUser(result.admin);
      const redirect = searchParams.get('redirect');
      router.push(redirect && redirect.startsWith('/') ? redirect : '/dashboard');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Login failed. Check your email and password.';
      toast.error(message);
    }
  };

  const onSubmit = form.handleSubmit(handleLogin);

  return {
    form,
    onSubmit,
    isLoading: form.formState.isSubmitting,
  };
};
