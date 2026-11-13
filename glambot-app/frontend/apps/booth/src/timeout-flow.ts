export type TimeoutAction = 'choose-frame' | 'confirm-frame' | 'auto-pick' | 'finish-edit' | 'confirm-output' | 'finish' | 'reset' | 'auto-complete' | null;

export function timeoutAction(status: string | undefined): TimeoutAction {
  switch (status) {
    case 'REVIEW': return 'choose-frame';
    case 'PHOTO_SELECTION': return 'auto-pick';
    case 'EDITING': return 'finish-edit';
    case 'FINAL_PREVIEW': return 'confirm-output';
    case 'FRAME_SELECTION': return 'confirm-frame';
    case 'QR_READY': return 'finish';
    case 'FINISHED':
    case 'ERROR': return 'reset';
    default: return 'auto-complete';
  }
}
