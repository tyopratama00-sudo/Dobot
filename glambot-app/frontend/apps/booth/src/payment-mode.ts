export function isFreeMode(config: { freeMode?: boolean; pricing: { firstPrint: number } } | null | undefined) {
  return config?.freeMode === true;
}
