import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const glassCardVariants = cva(
  'w-full border-2 rounded-3xl animate-[slideUp_300ms_ease-out] transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-primary/75 border-white/75 shadow-[0px_5.38px_26.92px_0px_rgba(17,45,78,0.5)]',
        secondary: 'bg-white/15 border-none rounded-3xl',
        outline: 'bg-transparent border-white/50',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface GlassCardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassCardVariants> {
  maxWidth?: string;
}

export default function GlassCard({
  className,
  variant,
  maxWidth = 'max-w-[480px]',
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(glassCardVariants({ variant }), maxWidth, className)}
      {...props}
    >
      {children}
    </div>
  );
}
