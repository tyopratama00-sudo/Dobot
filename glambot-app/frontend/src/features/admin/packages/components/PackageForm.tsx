'use client';

import { useRef, useState } from 'react';
import { Controller } from 'react-hook-form';
import Image from 'next/image';
import { AlertCircleIcon, UploadIcon } from 'lucide-react';
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
import { type Package } from '../api/types';
import { type CreatePackageInput } from '../api/createPackage';
import { PackageFormData } from '../forms/package';
import { usePackageForm } from '../hooks/usePackageForm';

interface PackageFormProps {
  defaultValues?: Partial<Package>;
  onSubmit: (data: CreatePackageInput & { image?: File }) => Promise<void>;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
}

const STATUS_OPTIONS = [
  {
    value: 'active',
    label: 'Active',
    description: 'Visible to end users',
    color: 'border-emerald-500 bg-emerald-50',
  },
  {
    value: 'inactive',
    label: 'Inactive',
    description: 'Hidden from end users',
    color: 'border-gray-400 bg-gray-50',
  },
  {
    value: 'draft',
    label: 'Draft',
    description: 'Work in progress',
    color: 'border-amber-500 bg-amber-50',
  },
] as const;

export function PackageForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  mode,
}: PackageFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    defaultValues?.imageSrc || null,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  const { form } = usePackageForm({
    defaultValues,
    onSubmit: async (data: PackageFormData) => {
      await onSubmit({
        ...data,
        image: imageFile ?? undefined,
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setFileError('File must be JPG, PNG, or WebP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError('File size must be less than 5MB');
      return;
    }

    setFileError('');
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setPreviewUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFormSubmit = form.handleSubmit(async (data: PackageFormData) => {
    await onSubmit({ ...data, image: imageFile ?? undefined });
  });

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Image Upload */}
        <div className="space-y-4">
          <div>
            <Label className="text-base font-semibold">Package Image</Label>
            <p className="text-muted-foreground mt-1 text-sm">
              Upload JPG, PNG, or WebP (max 5MB)
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-6">
            <div className="bg-muted relative aspect-square w-full max-w-40 overflow-hidden rounded-lg border">
              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt="Package preview"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="text-muted-foreground flex h-full items-center justify-center">
                  <div className="text-center">
                    <UploadIcon className="mx-auto mb-2 size-10" />
                    <p className="text-xs">No image</p>
                  </div>
                </div>
              )}
            </div>

            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
              aria-label="Upload package image"
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
        </div>

        {/* Form Fields */}
        <div className="space-y-5 lg:col-span-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Package Name <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <div>
                  <Input
                    {...field}
                    id="name"
                    placeholder="e.g., Basic Digital Package"
                    className={fieldState.invalid ? 'border-destructive' : ''}
                    aria-describedby={fieldState.invalid ? 'name-error' : undefined}
                  />
                  {fieldState.invalid && (
                    <p
                      id="name-error"
                      className="text-destructive mt-1 flex items-center gap-1 text-xs"
                    >
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
                  className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
                  placeholder="Optional package description"
                />
              )}
            />
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="price">
              Price (IDR) <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={form.control}
              name="price"
              render={({ field, fieldState }) => (
                <div>
                  <Input
                    {...field}
                    id="price"
                    type="number"
                    min={0}
                    placeholder="0"
                    className={fieldState.invalid ? 'border-destructive' : ''}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    aria-describedby={fieldState.invalid ? 'price-error' : undefined}
                  />
                  {fieldState.invalid && (
                    <p
                      id="price-error"
                      className="text-destructive mt-1 flex items-center gap-1 text-xs"
                    >
                      <AlertCircleIcon className="size-3" />
                      {fieldState.error?.message}
                    </p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Duration, Print Count & Print Unit Price */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">
                Duration (minutes) <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={form.control}
                name="duration"
                render={({ field, fieldState }) => (
                  <div>
                    <Input
                      {...field}
                      id="duration"
                      type="number"
                      min={1}
                      placeholder="60"
                      className={fieldState.invalid ? 'border-destructive' : ''}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      aria-describedby={fieldState.invalid ? 'duration-error' : undefined}
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Duration in minutes
                    </p>
                    {fieldState.invalid && (
                      <p
                        id="duration-error"
                        className="text-destructive mt-1 flex items-center gap-1 text-xs"
                      >
                        <AlertCircleIcon className="size-3" />
                        {fieldState.error?.message}
                      </p>
                    )}
                  </div>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="printCount">Print Count</Label>
              <Controller
                control={form.control}
                name="printCount"
                render={({ field, fieldState }) => (
                  <div>
                    <Input
                      {...field}
                      id="printCount"
                      type="number"
                      min={0}
                      placeholder="0"
                      className={fieldState.invalid ? 'border-destructive' : ''}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Number of prints included
                    </p>
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

            <div className="space-y-2">
              <Label htmlFor="printUnitPrice">Print Unit Price (IDR)</Label>
              <Controller
                control={form.control}
                name="printUnitPrice"
                render={({ field, fieldState }) => (
                  <div>
                    <Input
                      {...field}
                      id="printUnitPrice"
                      type="number"
                      min={0}
                      placeholder="0"
                      className={fieldState.invalid ? 'border-destructive' : ''}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Price per extra print
                    </p>
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

          {/* Package Code */}
          <div className="space-y-2">
            <Label htmlFor="code">
              Package Type <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={form.control}
              name="code"
              render={({ field, fieldState }) => (
                <div>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="code"
                      className={fieldState.invalid ? 'border-destructive' : ''}
                      aria-describedby={fieldState.invalid ? 'code-error' : undefined}
                    >
                      <SelectValue placeholder="Select package type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular (Digital Only)</SelectItem>
                      <SelectItem value="vip">VIP (Print + Digital)</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <p
                      id="code-error"
                      className="text-destructive mt-1 flex items-center gap-1 text-xs"
                    >
                      <AlertCircleIcon className="size-3" />
                      {fieldState.error?.message}
                    </p>
                  )}
                </div>
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
                <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Package status">
                  {STATUS_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                        field.value === option.value
                          ? option.color
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={option.value}
                        checked={field.value === option.value}
                        onChange={() => field.onChange(option.value)}
                        className="mt-1 size-4"
                        aria-label={option.label}
                      />
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-muted-foreground text-xs">
                          {option.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            />
          </div>

          {/* Popular Flag */}
          <div className="space-y-3">
            <Label>Popular Package</Label>
            <Controller
              control={form.control}
              name="isPopular"
              render={({ field }) => (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isPopular"
                    checked={field.value || false}
                    onChange={field.onChange}
                    className="size-4 rounded border-gray-300"
                  />
                  <Label htmlFor="isPopular" className="text-sm font-normal">
                    Mark as popular package
                  </Label>
                </div>
              )}
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === 'create'
              ? 'Creating...'
              : 'Saving...'
            : mode === 'create'
              ? 'Create Package'
              : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
