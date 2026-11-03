export function isFreeMode(config: { freeMode?: boolean; pricing: { firstPrint: number } } | null | undefined) {
  return config?.freeMode === true;
}

/**
 * Booth still shows the free page but the backend wants payment (admin turned Free Mode off
 * after this config was loaded). The free page has no QR, so waiting here would never end.
 */
export function freeModeOutdated(config: Parameters<typeof isFreeMode>[0], status: string) {
  return isFreeMode(config) && status === 'WAITING_PAYMENT';
}
