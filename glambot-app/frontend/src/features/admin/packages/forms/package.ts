import { z } from 'zod';

export const packageSchema = z.object({
  name: z
    .string()
    .min(1, 'Package name is required')
    .max(100, 'Name must be at most 100 characters'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional(),
  price: z
    .number()
    .min(0, 'Price must be at least 0'),
  duration: z
    .number()
    .int('Duration must be a whole number')
    .min(1, 'Duration must be at least 1 minute'),
  code: z.enum(['vip', 'regular']),
  status: z.enum(['active', 'inactive', 'draft']),
  isPopular: z.boolean().optional(),
  printCount: z
    .number()
    .int()
    .min(0, 'Print count must be at least 0')
    .optional(),
  printUnitPrice: z
    .number()
    .min(0, 'Print unit price must be at least 0')
    .optional(),
});

export type PackageFormData = z.infer<typeof packageSchema>;
