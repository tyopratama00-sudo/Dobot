'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { FrameForm } from '../components/FrameForm';
import { useUpdateFrame, type UpdateFrameInput } from '../api/updateFrame';
import { useGetFrameById } from '../api/getFrameById';
import { Button } from '@/components/admin/ui/button';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { NotFoundState } from '@/components/admin/shared/NotFoundState';
import { ChevronLeftIcon } from 'lucide-react';
import { toast } from 'sonner';

interface FrameEditPageProps {
  id: string;
}

export function FrameEditPage({ id }: FrameEditPageProps) {
  const router = useRouter();
  const { data: frame, isLoading, isError } = useGetFrameById({ id });
  const updateMutation = useUpdateFrame();

  const handleSubmit = async (data: UpdateFrameInput) => {
    try {
      await updateMutation.mutateAsync({ id, data });
      toast.success('Frame updated successfully');
      router.push('/frame');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An error occurred while updating the frame';
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-125 w-full" />
      </div>
    );
  }

  if (isError || !frame) {
    return (
      <NotFoundState
        title="Frame not found"
        backLabel="Back to Frames"
        onBack={() => router.push('/frame')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-regular text-xl leading-7">Edit Frame Photo</h1>
          <p className="text-muted-foreground mt-1 text-[14px] leading-5">
            Update frame information <br /> and assets
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/frame')}
          className="gap-2 rounded-[8px] text-[16px] leading-6"
        >
          <ChevronLeftIcon className="size-4" />
          Back to Frame
        </Button>
      </div>

      <div className="bg-card rounded-[8px] border p-6 shadow-sm">
        <FrameForm
          defaultValues={frame}
          onSubmit={handleSubmit}
          isSubmitting={updateMutation.isPending}
          mode="edit"
        />
      </div>
    </div>
  );
}
