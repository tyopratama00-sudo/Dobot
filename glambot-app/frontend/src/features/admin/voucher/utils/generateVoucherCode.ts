/**
 * Generate a unique voucher code in format: VOUCHER-{8 random chars}
 */
export const generateVoucherCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code1 = '';
  let code2 = '';
  for (let i = 0; i < 4; i++) {
    code1 += chars.charAt(Math.floor(Math.random() * chars.length));
    code2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GLAM-${code1}-${code2}`;
};
