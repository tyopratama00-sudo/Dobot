'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApplyVoucher } from '../api/validateVoucher';
import { getSessionQueryOptions } from '@/shared/api/session';
import { playBackendAudio } from '@/lib/audio';

export function useVoucher(sessionId: string) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  const queryClient = useQueryClient();

  const { isPending: loading, mutate } = useApplyVoucher({
    mutationConfig: {
      onSuccess: (result) => {
        setIsValid(result.valid);
        setMessage(result.message);

        // Narasi hasil voucher — request ini selalu dari tap tombol user, jadi
        // autoplay aman. Kode ditolak backend tetap masuk onSuccess (HTTP 200
        // dengan valid=false), makanya cabangnya dari result.valid, bukan onError.
        playBackendAudio(
          result.valid ? 'voucherBerhasil.mp3' : 'voucherGagal.mp3',
        );

        // Invalidate session query to refresh data
        queryClient.invalidateQueries({
          queryKey: getSessionQueryOptions(sessionId).queryKey,
        });
      },
      onError: () => {
        setMessage('Failed to apply voucher');
        setIsValid(false);
        playBackendAudio('voucherGagal.mp3');
      },
    },
  });

  const applyVoucher = () => {
    if (!code.trim() || !sessionId) return;
    setMessage(null);
    mutate({ sessionId, voucherCode: code });
  };

  return { code, setCode, message, isValid, loading, applyVoucher };
}
