import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          'gradient-primary border border-[#F9F7F7]/75 shadow-sm shadow-blue-100/50 text-white font-semibold shadow-sm active:scale-95',
        outline:
          'bg-blue-100/15 border border-blue-100/85 text-white font-medium shadow-[0_0_16px_rgba(63,114,175,0.5)] active:scale-95',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 active:scale-95',
        ghost: 'hover:bg-white/10 text-white active:scale-95',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-14 py-3.5 text-lg',
        sm: 'px-6 py-2 text-sm',
        lg: 'px-19 py-8.5 text-[34px] leading-[55px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
