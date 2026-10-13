'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryConfig } from '@/lib/react-query';
import { preloadBackendAudio } from '@/lib/audio';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: queryConfig }),
  );

  // Preload semua narasi suara sekali di awal (saat kiosk boot) supaya suara
  // di tiap halaman langsung berbunyi tanpa jeda download.
  useEffect(() => {
    preloadBackendAudio();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
