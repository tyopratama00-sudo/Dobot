import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface InfoRowProps {
  label: string;
  value: ReactNode;
  /** Baris terakhir dalam satu blok tidak diberi garis pemisah. */
  last?: boolean;
}

/**
 * Baris "label — nilai" pada blok Information kartu perangkat
 * (kamera/printer/robot). Markup-nya sama persis di ketiganya.
 */
export function InfoRow({ label, value, last }: InfoRowProps) {
  return (
    <div className={cn('flex justify-between', !last && 'border-b pb-2')}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
