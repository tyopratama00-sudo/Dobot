import { apiClient } from '@/lib/api-client';

// Kirim perintah cetak strip foto sesi ke printer fisik. Jumlah salinan
// ditentukan backend dari print_count paket sesi. Dipanggil non-blocking
// setelah komposisi tersimpan — kegagalan cetak (mis. printer offline) tidak
// boleh menghentikan alur user ke halaman download.
export const printComposition = async (sessionId: string): Promise<void> => {
  await apiClient.post('/api/photo/print', { session_id: sessionId });
};
