import { expect, test } from 'vitest';
import { ApiError, NetworkError } from './api/client';
import { customerFacingStatus, customerMessage, GENERIC, OFFLINE, printProblem } from './customer-error';

test('printer errors become plain words with a staff code', () => {
  expect(printProblem('Gagal mencetak: tidak ada printer fisik terdeteksi')).toEqual({ code: 'PRINT-01', message: 'Printer belum tersambung.' });
  expect(printProblem('Gagal mencetak: printer "Canon SELPHY CP1500" belum siap (status: Offline)').code).toBe('PRINT-02');
  expect(printProblem('The operation was aborted due to timeout').code).toBe('PRINT-03');
  expect(printProblem('Gagal mencetak 1 salinan ke "X": exit status 1').code).toBe('PRINT-00');
  expect(printProblem(null).code).toBe('PRINT-00');
});

test('customer never sees a technical backend message', () => {
  // go() only keeps userMessage for validation-style statuses.
  expect(customerFacingStatus(400)).toBe(true);
  expect(customerFacingStatus(500)).toBe(false);
  expect(customerFacingStatus(404)).toBe(false);
  expect(customerMessage(new ApiError(500, 'HTTP_500', 'Failed to read frames'))).toBe(GENERIC);
  expect(customerMessage(new ApiError(400, 'HTTP_400', 'Alamat email tidak valid', 'Alamat email tidak valid'))).toBe('Alamat email tidak valid');
  expect(customerMessage(new NetworkError('Failed to fetch'))).toBe(OFFLINE);
  expect(customerMessage(new Error('Belum ada paket aktif di admin'), 'Booth belum siap.')).toBe('Booth belum siap.');
  expect(GENERIC).toMatch(/hubungi petugas/);
});
