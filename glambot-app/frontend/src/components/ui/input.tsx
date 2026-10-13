import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-full w-full rounded-2xl',
        'bg-[#F9F7F7]/5 border border-blue-100/50',
        'px-4 py-3.5 text-base text-white placeholder:text-blue-100',
        'outline-none transition-colors',
        'focus:border-white/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
