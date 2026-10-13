/**
 * Bungkus handler submit dengan try/catch + logging seragam untuk form admin
 * (voucher/frame/package).
 */
export function withFormErrorLogging<T>(onSubmit: (data: T) => Promise<void>) {
  return async (data: T) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };
}
