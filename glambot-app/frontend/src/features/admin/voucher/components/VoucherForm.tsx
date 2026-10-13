'use client';

import { useCallback, useEffect, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
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
import { Separator } from '@/components/admin/ui/separator';
import { Voucher } from '../api/types';
import { useVoucherForm } from '../hooks/useVoucherForm';
import { VoucherFormData } from '../forms/voucher';
import { formatCurrency } from '../utils/formatDiscount';
import { generateVoucherCode } from '../utils/generateVoucherCode';
import { AlertCircleIcon, RefreshCw, RotateCcw, Ticket } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/admin/ui/popover';
import { Calendar } from '@/components/admin/ui/calendar';
import { format } from 'date-fns';

interface VoucherFormProps {
  defaultValues?: Partial<Voucher>;
  onSubmit: (data: VoucherFormData) => Promise<void>;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
}

export function VoucherForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  mode,
}: VoucherFormProps) {
  const [codeMode, setCodeMode] = useState<'auto' | 'manual'>('auto');

  const { form } = useVoucherForm({
    defaultValues,
    onSubmit,
  });

  const handleGenerateCode = useCallback(() => {
    const code = generateVoucherCode();
    form.setValue('code', code);
  }, [form]);

  const handleReset = () => {
    form.reset();
    if (codeMode === 'auto') {
      handleGenerateCode();
    }
  };

  const [
    discountType,
    voucherCode,
    discountValue,
    minPrice,
    expiresAt,
    isActive,
  ] = useWatch({
    control: form.control,
    name: [
      'discountType',
      'code',
      'discountValue',
      'minPrice',
      'expiresAt',
      'isActive',
    ],
  });

  const handleSubmit = form.handleSubmit(onSubmit);

  useEffect(() => {
    if (mode === 'create' && !defaultValues?.code) {
      handleGenerateCode();
    }
  }, [defaultValues?.code, mode, handleGenerateCode]);

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        {/* Left Column: Form */}
        <div className="lg:col-span-2">
          <Card className="rounded-[8px] shadow-none ring-0">
            <CardContent className="p-6">
              <div className="space-y-6">
                {/* Section: Voucher Information */}
                <section className="space-y-4">
                  <h3 className="text-base font-semibold">
                    Voucher Information
                  </h3>

                  {/* Voucher Code */}
                  <div className="space-y-3">
                    <Label>
                      Voucher Code <span className="text-destructive">*</span>
                    </Label>
                    {mode === 'create' && (
                      <div className="flex gap-4">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            checked={codeMode === 'auto'}
                            onChange={() => {
                              setCodeMode('auto');
                              handleGenerateCode();
                            }}
                            className="size-4"
                          />
                          <span className="text-sm">Auto Generate</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            checked={codeMode === 'manual'}
                            onChange={() => setCodeMode('manual')}
                            className="size-4"
                          />
                          <span className="text-sm">Manual Input</span>
                        </label>
                      </div>
                    )}

                    <Controller
                      control={form.control}
                      name="code"
                      render={({ field, fieldState }) => (
                        <div>
                          <div className="flex gap-2">
                            <Input
                              {...field}
                              placeholder="GLAM-8F7K-2E3J"
                              className={`rounded-[8px] ${
                                fieldState.invalid ? 'border-destructive' : ''
                              }`}
                              readOnly={codeMode === 'auto' || mode === 'edit'}
                            />
                            {codeMode === 'auto' && mode === 'create' && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleGenerateCode}
                                className="gap-2 rounded-[8px]"
                              >
                                <RefreshCw className="size-4" />
                                Regenerate
                              </Button>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            Voucher code must be unique and cannot be changed
                            after creation
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

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Controller
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <Input
                          {...field}
                          id="description"
                          placeholder="20% discount for all packages"
                          className="rounded-[8px]"
                        />
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Discount Type */}
                    <div className="space-y-2">
                      <Label htmlFor="discountType">
                        Discount Type{' '}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Controller
                        control={form.control}
                        name="discountType"
                        render={({ field }) => (
                          <div>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger
                                id="discountType"
                                className="w-full rounded-[8px]"
                              >
                                <SelectValue placeholder="Select discount type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percentage">
                                  Percentage
                                </SelectItem>
                                <SelectItem value="fixed">
                                  Fixed Amount
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="mt-1 text-xs text-gray-500">
                              Select the type of voucher to create
                            </p>
                          </div>
                        )}
                      />
                    </div>

                    {/* Discount Value */}
                    <div className="space-y-2">
                      <Label htmlFor="discountValue">
                        Discount Value{' '}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Controller
                        control={form.control}
                        name="discountValue"
                        render={({ field, fieldState }) => (
                          <div>
                            <div className="relative">
                              <Input
                                {...field}
                                value={(field.value as string | number) ?? ''}
                                id="discountValue"
                                type="number"
                                placeholder={
                                  discountType === 'percentage' ? '20' : '50000'
                                }
                                className={`w-full rounded-[8px] ${
                                  fieldState.invalid ? 'border-destructive' : ''
                                }`}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ''
                                      ? ''
                                      : Number(e.target.value),
                                  )
                                }
                              />
                              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-gray-500">
                                {discountType === 'percentage' ? '%' : 'Rp'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              Enter the discount value
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
                </section>

                <Separator />

                {/* Section: Usage Settings */}
                <section className="space-y-4">
                  <h3 className="text-base font-semibold">Usage Settings</h3>

                  {/* Min Price */}
                  <div className="space-y-2">
                    <Label htmlFor="minPrice">
                      Minimum Purchase (Optional)
                    </Label>
                    <Controller
                      control={form.control}
                      name="minPrice"
                      render={({ field }) => (
                        <div>
                          <div className="relative">
                            <Input
                              {...field}
                              value={(field.value as string | number) ?? ''}
                              id="minPrice"
                              type="number"
                              placeholder="100000"
                              className="rounded-[8px]"
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === ''
                                    ? ''
                                    : Number(e.target.value),
                                )
                              }
                            />
                            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-gray-500">
                              Rp
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            Minimum transaction for the voucher to be usable
                          </p>
                        </div>
                      )}
                    />
                  </div>

                  {/* Max Uses */}
                  <div className="space-y-2">
                    <Label htmlFor="maxUses">
                      Quota <span className="text-destructive">*</span>
                    </Label>
                    <Controller
                      control={form.control}
                      name="maxUses"
                      render={({ field, fieldState }) => (
                        <div>
                          <Input
                            {...field}
                            value={(field.value as string | number) ?? ''}
                            id="maxUses"
                            type="number"
                            placeholder="500"
                            className={`rounded-[8px] ${fieldState.invalid ? 'border-destructive' : ''}`}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ''
                                  ? ''
                                  : Number(e.target.value),
                              )
                            }
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Total number of times the voucher can be used
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

                  {/* Expires At */}
                  <div className="space-y-2">
                    <Label htmlFor="expiresAt">
                      Expires At <span className="text-destructive">*</span>
                    </Label>
                    <Controller
                      control={form.control}
                      name="expiresAt"
                      render={({ field, fieldState }) => {
                        const dateValue = field.value
                          ? new Date(field.value)
                          : undefined;
                        return (
                          <div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={`hover:bg-accent/50 grid h-10 w-full grid-cols-3 items-center rounded-[8px] border bg-transparent px-3 text-center text-sm font-normal shadow-sm ${
                                    fieldState.invalid
                                      ? 'border-destructive'
                                      : 'border-input'
                                  }`}
                                >
                                  <span>
                                    {dateValue && !isNaN(dateValue.getTime())
                                      ? format(dateValue, 'MMMM')
                                      : '-'}
                                  </span>
                                  <span>
                                    {dateValue && !isNaN(dateValue.getTime())
                                      ? format(dateValue, 'd')
                                      : '-'}
                                  </span>
                                  <span>
                                    {dateValue && !isNaN(dateValue.getTime())
                                      ? format(dateValue, 'yyyy')
                                      : '-'}
                                  </span>
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="start"
                              >
                                <Calendar
                                  mode="single"
                                  selected={dateValue}
                                  onSelect={(date) => {
                                    if (date) {
                                      const yyyy = date.getFullYear();
                                      const mm = String(
                                        date.getMonth() + 1,
                                      ).padStart(2, '0');
                                      const dd = String(
                                        date.getDate(),
                                      ).padStart(2, '0');
                                      field.onChange(`${yyyy}-${mm}-${dd}`);
                                    } else {
                                      field.onChange('');
                                    }
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                            <p className="mt-1 text-xs text-gray-500">
                              Select the voucher expiry date
                            </p>
                            {fieldState.invalid && (
                              <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                                <AlertCircleIcon className="size-3" />
                                {fieldState.error?.message}
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                  </div>

                  {/* Is Active */}
                  <div className="space-y-3">
                    <Label>Status</Label>
                    <Controller
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <div className="grid grid-cols-2 gap-3">
                          <label
                            className={`flex cursor-pointer items-start gap-3 rounded-[8px] border p-4 transition-colors ${
                              field.value === true
                                ? 'border-blue-500 bg-blue-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              checked={field.value === true}
                              onChange={() => field.onChange(true)}
                              className="mt-1 size-4"
                            />
                            <div>
                              <div className="font-medium">Active</div>
                              <div className="text-xs text-gray-500">
                                Voucher can be used
                              </div>
                            </div>
                          </label>

                          <label
                            className={`flex cursor-pointer items-start gap-3 rounded-[8px] border p-4 transition-colors ${
                              field.value === false
                                ? 'border-gray-500 bg-gray-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              checked={field.value === false}
                              onChange={() => field.onChange(false)}
                              className="mt-1 size-4"
                            />
                            <div>
                              <div className="font-medium">Inactive</div>
                              <div className="text-xs text-gray-500">
                                Voucher is deactivated
                              </div>
                            </div>
                          </label>
                        </div>
                      )}
                    />
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="gap-2 rounded-[8px]"
              disabled={isSubmitting}
            >
              <RotateCcw className="size-4" />
              Reset Form
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="gap-2 rounded-[8px]"
            >
              <Ticket className="size-4" />
              {isSubmitting ? 'Saving...' : 'Generate Voucher'}
            </Button>
          </div>
        </div>

        {/* Right Column: Summary */}
        <div className="space-y-4">
          <Card className="rounded-[8px] border-blue-200 bg-blue-50">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-blue-500">
                  <Ticket className="size-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-blue-900">
                  Voucher Summary
                </h3>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-blue-700">Voucher Code</p>
                  <p className="font-mono text-sm font-semibold text-blue-900">
                    {voucherCode || '-'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-blue-700">Discount Type</p>
                  <p className="text-sm font-medium text-blue-900">
                    {discountType === 'percentage'
                      ? 'Percentage'
                      : 'Fixed Amount'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-blue-700">Discount Value</p>
                  <p className="text-sm font-semibold text-blue-900">
                    {discountValue
                      ? discountType === 'percentage'
                        ? `${discountValue}%`
                        : formatCurrency(Number(discountValue))
                      : '-'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-blue-700">Minimum Price</p>
                  <p className="text-sm font-medium text-blue-900">
                    {minPrice ? formatCurrency(Number(minPrice)) : '-'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-blue-700">Expires At</p>
                  <p className="text-sm font-medium text-blue-900">
                    {expiresAt
                      ? new Date(expiresAt).toLocaleDateString('en-US', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'No expiry'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-blue-700">Status</p>
                  <p className="text-sm font-medium text-blue-900">
                    {isActive ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tips Card */}
          <Card className="rounded-[8px] border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full bg-blue-500 text-white">
                  <span className="text-xs font-bold">i</span>
                </div>
                <h3 className="font-semibold text-blue-900">Tips</h3>
              </div>
              <ul className="space-y-1 text-xs leading-relaxed text-blue-800">
                <li>• Make sure the voucher code is unique</li>
                <li>• A voucher&apos;s code cannot be changed after it is created</li>
                <li>• Deactivate vouchers that are no longer valid</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
