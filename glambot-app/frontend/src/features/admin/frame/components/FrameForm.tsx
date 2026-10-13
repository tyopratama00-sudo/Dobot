'use client';

import { useState, useRef } from 'react';
import { Controller } from 'react-hook-form';
import Image from 'next/image';
import {
  UploadIcon,
  InfoIcon,
  AlertCircleIcon,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Label } from '@/components/admin/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select';
import { Card, CardContent } from '@/components/admin/ui/card';
import { Progress } from '@/components/admin/ui/progress';
import { Badge } from '@/components/admin/ui/badge';
import { type Frame } from '../api/types';
import { type UpdateFrameInput } from '../api/updateFrame';
import { FrameFormData } from '../forms/frame';
import { useFrameForm } from '../hooks/useFrameForm';
import { useRouter } from 'next/navigation';
import { SlotEditor } from './SlotEditor';

interface FrameFormProps {
  defaultValues?: Partial<Frame>;
  onSubmit: (data: UpdateFrameInput) => Promise<void>;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
}

export function FrameForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  mode,
}: FrameFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    defaultValues?.filePath || null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>('');

  const { form } = useFrameForm({
    defaultValues,
    onSubmit: async (data: FrameFormData) => {
      const submitData: UpdateFrameInput = {
        name: data.name,
        category: data.category,
        description: data.description,
        status: data.status,
        canvasWidth: data.canvasWidth,
        canvasHeight: data.canvasHeight,
        slots: data.slots,
      };

      if (file) {
        submitData.file = file;
      }

      await onSubmit(submitData);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (
      !selectedFile.type.includes('png') &&
      !selectedFile.type.includes('svg')
    ) {
      setFileError('File must be in PNG or SVG format');
      return;
    }

    setFileError('');
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setPreviewUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleNext = () => {
    // Cukup file untuk lanjut; validasi canvas/slot ditunda ke Save supaya
    // frame dengan slot lama tidak bikin tombol Next "diam".
    const hasFile = mode === 'edit' || file || previewUrl;
    if (!hasFile) {
      setFileError('Frame file is required');
      return;
    }
    setFileError('');
    setCurrentStep(2);
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  const submitForm = form.handleSubmit(
    async (data: FrameFormData) => {
      const submitData: UpdateFrameInput = {
        name: data.name,
        category: data.category,
        description: data.description,
        status: data.status,
        canvasWidth: data.canvasWidth,
        canvasHeight: data.canvasHeight,
        slots: data.slots,
      };

      if (file) {
        submitData.file = file;
      }

      await onSubmit(submitData);
    },
    (errors) => {
      // Field Step 1 (canvas/slot) tidak terlihat saat di Step 2 — balik ke
      // Step 1 agar admin bisa melihat & memperbaiki errornya.
      if (errors.canvasWidth || errors.canvasHeight || errors.slots) {
        setCurrentStep(1);
      }
    },
  );

  // Form HANYA menyimpan di Step 2; submit apa pun di Step 1 (mis. Enter di
  // input) dialihkan jadi "lanjut ke Step 2".
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentStep !== 2) {
      handleNext();
      return;
    }
    void submitForm(e);
  };

  const progress = (currentStep / 2) * 100;

  const slotsError = form.formState.errors.slots;

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">
      {/* Progress Header */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge
                  variant={currentStep >= 1 ? 'default' : 'secondary'}
                  className="flex size-8 items-center justify-center rounded-full p-0"
                >
                  {currentStep > 1 ? <Check className="size-4" /> : '1'}
                </Badge>
                <div>
                  <div className="font-semibold">Upload & Slots</div>
                  <div className="text-muted-foreground text-sm">
                    Upload image and define slots
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Badge
                  variant={currentStep >= 2 ? 'default' : 'secondary'}
                  className="flex size-8 items-center justify-center rounded-full p-0"
                >
                  2
                </Badge>
                <div>
                  <div className="font-semibold">Frame Details</div>
                  <div className="text-muted-foreground text-sm">
                    Fill in frame information
                  </div>
                </div>
              </div>
            </div>

            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Upload & Slots */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Upload Section */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-semibold">
                      Frame Image
                    </Label>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Upload PNG or SVG file
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-6">
                    <div className="bg-muted relative aspect-464/696 w-full max-w-48 overflow-hidden rounded-lg border">
                      {previewUrl ? (
                        <Image
                          src={previewUrl}
                          alt="Frame Preview"
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="text-muted-foreground flex h-full items-center justify-center">
                          <div className="text-center">
                            <UploadIcon className="mx-auto mb-2 size-12" />
                            <p className="text-sm">No image</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <input
                      type="file"
                      accept=".png,.svg"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadIcon className="mr-2 size-4" />
                      {previewUrl ? 'Change Image' : 'Upload Image'}
                    </Button>

                    {fileError && (
                      <p className="text-destructive flex items-center gap-1 text-xs">
                        <AlertCircleIcon className="size-3" />
                        {fileError}
                      </p>
                    )}
                  </div>

                  {/* Canvas Size */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Canvas Size</Label>
                    <p className="text-muted-foreground text-xs">
                      Ratio locked to 2:3 (e.g. 464×696, 400×600) — change one,
                      the other adjusts automatically.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="canvasWidth" className="text-xs">
                          Width (px)
                        </Label>
                        <Controller
                          control={form.control}
                          name="canvasWidth"
                          render={({ field, fieldState }) => (
                            <div>
                              <Input
                                {...field}
                                id="canvasWidth"
                                type="number"
                                className={`mt-1 ${fieldState.invalid ? 'border-destructive' : ''}`}
                                onChange={(e) => {
                                  // Kunci rasio 2:3 (464×696). Height ikut width.
                                  const w = Number(e.target.value);
                                  field.onChange(w);
                                  form.setValue(
                                    'canvasHeight',
                                    Math.round(w * 1.5),
                                    { shouldValidate: true },
                                  );
                                }}
                              />
                              {fieldState.invalid && (
                                <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                                  <AlertCircleIcon className="size-3" />
                                  {fieldState.error?.message}
                                </p>
                              )}
                            </div>
                          )}
                        />
                      </div>
                      <div>
                        <Label htmlFor="canvasHeight" className="text-xs">
                          Height (px)
                        </Label>
                        <Controller
                          control={form.control}
                          name="canvasHeight"
                          render={({ field, fieldState }) => (
                            <div>
                              <Input
                                {...field}
                                id="canvasHeight"
                                type="number"
                                className={`mt-1 ${fieldState.invalid ? 'border-destructive' : ''}`}
                                onChange={(e) => {
                                  // Kunci rasio 2:3 (464×696). Width ikut height.
                                  const h = Number(e.target.value);
                                  field.onChange(h);
                                  form.setValue(
                                    'canvasWidth',
                                    Math.round(h / 1.5),
                                    { shouldValidate: true },
                                  );
                                }}
                              />
                              {fieldState.invalid && (
                                <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                                  <AlertCircleIcon className="size-3" />
                                  {fieldState.error?.message}
                                </p>
                              )}
                            </div>
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="p-3">
                      <div className="flex gap-2">
                        <InfoIcon className="mt-0.5 size-4 shrink-0 text-blue-600" />
                        <p className="text-xs text-blue-900">
                          Use PNG with transparent background for best results
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Slot Editor */}
                <div className="lg:col-span-2">
                  <Controller
                    control={form.control}
                    name="slots"
                    render={({ field }) => (
                      <>
                        <SlotEditor
                          imageUrl={previewUrl}
                          canvasWidth={form.watch('canvasWidth')}
                          canvasHeight={form.watch('canvasHeight')}
                          slots={field.value.map((slot, index) => ({
                            ...slot,
                            id: `slot-${index}`,
                          }))}
                          onSlotsChange={(newSlots) =>
                            field.onChange(
                              newSlots.map(({ id: _id, ...rest }) => rest),
                            )
                          }
                        />
                        {slotsError && (
                          <p className="text-destructive mt-2 flex items-center gap-1 text-sm">
                            <AlertCircleIcon className="size-4" />
                            {slotsError.message ||
                              (slotsError as { root?: { message?: string } })
                                ?.root?.message}
                          </p>
                        )}
                      </>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Details */}
      {currentStep === 2 && (
        <Card>
          <CardContent className="p-6">
            <div className="mx-auto max-w-2xl space-y-6">
              <div>
                <h3 className="mb-1 text-lg font-semibold">Frame Details</h3>
                <p className="text-muted-foreground text-sm">
                  Fill in the frame information
                </p>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Frame Name <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <div>
                      <Input
                        {...field}
                        id="name"
                        placeholder="e.g., Popcorn Frame"
                        className={fieldState.invalid ? 'border-destructive' : ''}
                      />
                      {fieldState.invalid && (
                        <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                          <AlertCircleIcon className="size-3" />
                          {fieldState.error?.message}
                        </p>
                      )}
                    </div>
                  )}
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category">
                  Category <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={form.control}
                  name="category"
                  render={({ field, fieldState }) => (
                    <div>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger
                          id="category"
                          className={fieldState.invalid ? 'border-destructive' : ''}
                        >
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Personal">
                            Personal — 1–4 orang
                          </SelectItem>
                          <SelectItem value="Group">
                            Group — banyak orang
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                          <AlertCircleIcon className="size-3" />
                          {fieldState.error?.message}
                        </p>
                      )}
                    </div>
                  )}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Controller
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <textarea
                      {...field}
                      id="description"
                      className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
                      placeholder="Optional description"
                    />
                  )}
                />
              </div>

              {/* Status */}
              <div className="space-y-3">
                <Label>
                  Status <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-3">
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                          field.value === 'active'
                            ? 'border-blue-500 bg-blue-50'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="status"
                          value="active"
                          checked={field.value === 'active'}
                          onChange={() => field.onChange('active')}
                          className="mt-1 size-4"
                        />
                        <div>
                          <div className="font-medium">Active</div>
                          <div className="text-muted-foreground text-xs">
                            Frame is available
                          </div>
                        </div>
                      </label>

                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                          field.value === 'inactive'
                            ? 'border-gray-500 bg-gray-50'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="status"
                          value="inactive"
                          checked={field.value === 'inactive'}
                          onChange={() => field.onChange('inactive')}
                          className="mt-1 size-4"
                        />
                        <div>
                          <div className="font-medium">Inactive</div>
                          <div className="text-muted-foreground text-xs">
                            Frame is hidden
                          </div>
                        </div>
                      </label>
                    </div>
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (currentStep === 1) {
                  router.push('/frame');
                } else {
                  handleBack();
                }
              }}
              disabled={isSubmitting}
            >
              {currentStep === 1 ? (
                'Cancel'
              ) : (
                <>
                  <ArrowLeft className="mr-2 size-4" />
                  Back
                </>
              )}
            </Button>

            {currentStep === 1 ? (
              <Button
                key="frame-step-next"
                type="button"
                onClick={handleNext}
                disabled={isSubmitting}
                className="gap-2"
              >
                Next
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                key="frame-step-save"
                type="submit"
                disabled={isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? 'Saving...' : 'Save Frame'}
                <Check className="size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
