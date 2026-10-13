'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { FrameForm } from '../components/FrameForm';
import { useCreateFrame } from '../api/createFrame';
import { type UpdateFrameInput } from '../api/updateFrame';
import { Button } from '@/components/admin/ui/button';
import { ChevronLeftIcon } from 'lucide-react';
import { toast } from 'sonner';

export function FrameAddPage() {
  const router = useRouter();
  const createMutation = useCreateFrame();

  const handleSubmit = async (data: UpdateFrameInput) => {
    try {
      await createMutation.mutateAsync(data as Parameters<typeof createMutation.mutateAsync>[0]);
      toast.success('Frame created successfully');
      router.push('/frame');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred while creating the frame';
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-regular text-xl leading-7">Add Frame Photo</h1>
          <p className="text-muted-foreground mt-1 text-[14px] leading-5">
            Add new photo frames to <br /> Glambot Photo collection
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
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
          mode="create"
        />
      </div>
    </div>
  );
}
