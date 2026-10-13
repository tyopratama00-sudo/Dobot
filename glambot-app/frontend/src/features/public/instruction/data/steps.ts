export interface ActivityItem {
  label: string;
  description?: string;
}

export interface RuleItem {
  text: string;
  // Kunci ikon (dipetakan ke komponen lucide di InstructionCards).
  icon?: string;
}

/** Satu pose dalam sequence otomatis. */
export interface PoseItem {
  name: string;
  /** Keterangan singkat sudut/komposisi pose. */
  hint?: string;
}

/**
 * Bagian kartu yang disorot mengikuti narasi yang sedang berbunyi
 * (rangkaian cue-nya ada di InstructionPage → STEP_CUES).
 */
export type InstructionHighlight =
  | 'duration'
  | 'activities'
  | 'guideline'
  | 'poses'
  | 'camera';

export interface InstructionStep {
  id: number;
  type: 'get-ready' | 'safety' | 'pose-sequence';
  heading: string;
  subheading?: string;
  sessionDuration?: number;
  activities?: ActivityItem[];
  doRules?: RuleItem[];
  dontRules?: RuleItem[];
  guideline?: string;
  poses?: PoseItem[];
}

export const instructionSteps: InstructionStep[] = [
  {
    id: 1,
    type: 'get-ready',
    heading: 'Get Ready!',
    sessionDuration: 5,
    activities: [
      { label: 'Camera moves' },
      { label: 'It follows your face' },
      { label: 'Strike a pose' },
    ],
  },
  {
    id: 2,
    type: 'safety',
    heading: 'Safety & Rules',
    doRules: [
      { text: 'Stay 2m away from the robot', icon: 'ruler' },
      { text: 'Stay in detection area', icon: 'zone' },
      { text: 'Face the camera', icon: 'hand' },
      { text: 'Have fun and be creative!', icon: 'fun' },
    ],
    dontRules: [
      { text: 'Don’t get too close', icon: 'close' },
      { text: 'Don’t touch the robot', icon: 'touch' },
      { text: 'Don’t block the sensor', icon: 'sensor' },
      { text: 'No food or drinks nearby', icon: 'food' },
    ],
    // Face tracking mengunci SATU wajah (lihat face_backend.py: wajah terdekat
    // ke frame sebelumnya, atau terbesar), jadi aturan "satu orang" tetap
    // berlaku seperti dulu — hanya subjeknya wajah, bukan tangan.
    guideline: 'Only one person should be in the detection area at a time',
  },
  {
    id: 3,
    type: 'pose-sequence',
    heading: 'Automatic Poses',
    subheading:
      'The camera moves through 10 poses on its own — just look at it and pose',
    // Urutannya mengikuti SEQUENCE_PRESET_ORDER di dobot/.env (default 1..10).
    poses: [
      { name: 'Pose 1' },
      { name: 'Pose 2' },
      { name: 'Pose 3' },
      { name: 'Pose 4' },
      { name: 'Pose 5' },
      { name: 'Pose 6' },
      { name: 'Pose 7' },
      { name: 'Pose 8' },
      { name: 'Pose 9' },
      { name: 'Pose 10' },
    ],
  },
];
