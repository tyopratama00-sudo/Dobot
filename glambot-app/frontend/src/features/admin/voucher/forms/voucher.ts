import { z } from 'zod';

export const voucherSchema = z.object({
  code: z.string().min(1, 'Voucher code is required'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional(),
  discountType: z.enum(['percentage', 'fixed'], {
    message: 'Invalid discount type',
  }),
  discountValue: z
    .preprocess(
      (val) =>
        val === '' || val === undefined || val === null ? undefined : Number(val),
      z
        .number({ message: 'Discount value is required' })
        .positive('Discount value must be positive'),
    )
    .pipe(z.number()),
  minPrice: z
    .preprocess(
      (val) =>
        val === '' || val === undefined || val === null ? 0 : Number(val),
      z.number().nonnegative('Minimum purchase must be non-negative'),
    )
    .pipe(z.number()),
  maxUses: z
    .preprocess(
      (val) =>
        val === '' || val === undefined || val === null ? undefined : Number(val),
      z
        .number({ message: 'Quota is required' })
        .int('Quota must be an integer')
        .min(1, 'Quota must be at least 1'),
    )
    .pipe(z.number()),
  isActive: z.boolean(),
  expiresAt: z.string().min(1, 'Expiry date is required'),
});

export type VoucherFormData = z.infer<typeof voucherSchema>;

