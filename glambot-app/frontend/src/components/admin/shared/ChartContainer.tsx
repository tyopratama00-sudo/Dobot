'use client';

import * as React from 'react';

type ChartContainerProps = {
  className?: string;
  children: (size: { width: number; height: number }) => React.ReactNode;
};

/**
 * Ukur sendiri via ResizeObserver, baru render children setelah dimensinya
 * positif — menghindari warning recharts "width(-1)/height(-1)". Children
 * menerima angka konkret; jangan pakai ResponsiveContainer di dalamnya.
 */
export function ChartContainer({ className, children }: ChartContainerProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(
    null,
  );

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize((prev) =>
          prev && prev.width === width && prev.height === height
            ? prev
            : { width, height },
        );
      }
    });

    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={className ?? 'h-full w-full'}>
      {size ? children(size) : null}
    </div>
  );
}
