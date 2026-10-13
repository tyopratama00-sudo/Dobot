import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { frameSchema, FrameFormData } from '../forms/frame';
import { Frame } from '../api/types';
import { withFormErrorLogging } from '@/lib/formSubmit';

interface UseFrameFormProps {
  defaultValues?: Partial<Frame>;
  onSubmit: (data: FrameFormData) => Promise<void>;
}

export const useFrameForm = ({
  defaultValues,
  onSubmit,
}: UseFrameFormProps) => {
  const form = useForm<FrameFormData>({
    resolver: zodResolver(frameSchema),
    defaultValues: {
      canvasWidth: defaultValues?.canvasWidth ?? 464,
      canvasHeight: defaultValues?.canvasHeight ?? 696,
      slots: defaultValues?.slots
        ? defaultValues.slots.map(({ id: _id, ...rest }) => rest)
        : [],
      name: defaultValues?.name ?? '',
      category: defaultValues?.category ?? '',
      description: defaultValues?.description ?? '',
      status: defaultValues?.status ?? 'active',
    },
  });

  const handleSubmit = withFormErrorLogging(onSubmit);

  return {
    form,
    onSubmit: form.handleSubmit(handleSubmit),
    isLoading: form.formState.isSubmitting,
  };
};
