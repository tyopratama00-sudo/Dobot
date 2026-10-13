export type PhotoSessionMessage =
  | { type: 'SESSION_START'; sessionId: string }
  | { type: 'SESSION_END'; sessionId: string };

const CHANNEL_NAME = 'photo-session';

/**
 * Cadence pemancaran ulang SESSION_START selama sesi foto berjalan.
 *
 * SESSION_START dulu dikirim SEKALI saat pindah dari instruction, jadi jendela
 * lain yang dibuka / di-reload di tengah sesi tidak pernah tahu ada sesi aktif
 * (Monitor 2 nyangkut di "Standby", dan jendela yang tertinggal di Home tetap
 * memutar ajakan "sentuh layar" menimpa narasi sesi). Dengan heartbeat,
 * penerima cukup melihat "kapan terakhir dengar" — tanpa perlu endpoint baru.
 */
export const SESSION_HEARTBEAT_MS = 3_000;

export function sendSessionBroadcast(message: PhotoSessionMessage) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

export function listenSessionBroadcast(handlers: {
  onStart?: (sessionId: string) => void;
  onEnd?: (sessionId: string) => void;
}) {
  const channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<PhotoSessionMessage>) => {
    const msg = event.data;
    if (msg.type === 'SESSION_START') handlers.onStart?.(msg.sessionId);
    if (msg.type === 'SESSION_END') handlers.onEnd?.(msg.sessionId);
  };

  return () => channel.close();
}
