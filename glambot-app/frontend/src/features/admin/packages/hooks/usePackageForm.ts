import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { packageSchema, PackageFormData } from '../forms/package';
import { type Package, type PackageCode } from '../api/types';
import { withFormErrorLogging } from '@/lib/formSubmit';

interface UsePackageFormProps {
  defaultValues?: Partial<Package>;
  onSubmit: (data: PackageFormData) => Promise<void>;
}

export const usePackageForm = ({
  defaultValues,
  onSubmit,
}: UsePackageFormProps) => {
  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      price: defaultValues?.price ?? 0,
      duration: defaultValues?.durationMins ?? 60, // Use minutes from backend
      code: (defaultValues?.code as PackageCode) ?? 'regular', // Map from backend code
      status: defaultValues?.status ?? 'draft',
      isPopular: defaultValues?.isPopular ?? false,
      printCount: defaultValues?.printCount ?? 0,
      printUnitPrice: defaultValues?.printUnitPrice ?? 0,
    },
  });

  const handleSubmit = withFormErrorLogging(onSubmit);

  return {
    form,
    onSubmit: form.handleSubmit(handleSubmit),
    isLoading: form.formState.isSubmitting,
  };
};
