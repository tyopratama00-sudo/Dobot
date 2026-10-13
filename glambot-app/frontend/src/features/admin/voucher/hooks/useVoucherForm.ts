import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { voucherSchema, VoucherFormData } from '../forms/voucher';
import { Voucher } from '../api/types';
import { withFormErrorLogging } from '@/lib/formSubmit';

type VoucherFormInput = z.input<typeof voucherSchema>;

interface UseVoucherFormProps {
  defaultValues?: Partial<Voucher>;
  onSubmit: (data: VoucherFormData) => Promise<void>;
}

export const useVoucherForm = ({
  defaultValues,
  onSubmit,
}: UseVoucherFormProps) => {
  const form = useForm<VoucherFormInput, unknown, VoucherFormData>({
    resolver: zodResolver(voucherSchema),
    defaultValues: {
      code: defaultValues?.code || '',
      description: defaultValues?.description || '',
      discountType: defaultValues?.discountType || 'percentage',
      discountValue: defaultValues?.discountValue ?? '',
      minPrice: defaultValues?.minPrice ?? '',
      maxUses: defaultValues?.maxUses ?? '',
      isActive: defaultValues?.isActive ?? true,
      expiresAt: defaultValues?.expiresAt
        ? defaultValues.expiresAt.split('T')[0]
        : '',
    },
  });

  const handleSubmit = withFormErrorLogging(onSubmit);

  return {
    form,
    onSubmit: form.handleSubmit(handleSubmit),
    isLoading: form.formState.isSubmitting,
  };
};
