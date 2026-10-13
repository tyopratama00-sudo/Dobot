'use client';

/**
 * Halaman kalibrasi robot arm 3D di /arm-lab — BUKAN bagian alur kiosk.
 * Slider per joint & offset untuk mencocokkan angka `armKinematics.ts` secara
 * visual, plus "Copy pose" yang menyalin array sudut ke PRESET_POSES.
 */

import { useState } from 'react';
import { useSearchParams, notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { OrbitControls, Grid } from '@react-three/drei';
import {
  ARM_LINKS,
  PRESET_POSES,
  REST_POSE,
  type ArmPose,
} from '@/features/public/instruction/lib/armKinematics';
import { cn } from '@/lib/utils';

const RobotArm3D = dynamic(
  () => import('@/features/public/instruction/components/RobotArm3D'),
  { ssr: false },
);

/**
 * Sudut pandang tetap; `side` lurus dari sumbu X — celah antar link paling
 * gampang kelihatan dari sini.
 */
const VIEW_DIRS: Record<string, [number, number, number]> = {
  iso: [0.51, 0.2, 0.84],
  side: [1, 0, 0.001],
  side2: [-1, 0, 0.001],
  front: [0.001, 0, 1],
  back: [0.001, 0, -1],
  iso2: [-0.51, 0.2, -0.84],
  iso3: [0.51, 0.2, -0.84],
  top: [0.001, 1, 0.001],
};

// Di build produksi route ini 404 — alat kalibrasi tidak perlu (dan tidak
// boleh) bisa dibuka dari layar kiosk. Pembungkus terpisah supaya guard-nya
// berjalan sebelum komponen dengan hooks di-render.
export default function ArmLabRoute() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ArmLabPage />;
}

function ArmLabPage() {
  const params = useSearchParams();
  // `?pose=0,0,-30,60,...` & `?view=side` & `?hud=0` — dipakai untuk memotret
  // sudut pandang yang sama persis lintas iterasi kalibrasi.
  const posed = params.get('pose');
  const [pose, setPose] = useState<ArmPose>(
    posed ? posed.split(',').map(Number) : REST_POSE,
  );
  const [copied, setCopied] = useState(false);

  const showHud = params.get('hud') !== '0';

  // `?target=0,0.4,0&dist=0.5` untuk mendekat ke sambungan tertentu.
  const dir = VIEW_DIRS[params.get('view') ?? 'iso'] ?? VIEW_DIRS.iso;
  const dist = Number(params.get('dist') ?? 1.8);
  const target = (params.get('target')?.split(',').map(Number) ?? [0, 0, 0]) as [
    number,
    number,
    number,
  ];
  // `?eye=0.49,0.29,1.81` — pakai posisi kamera world apa adanya, menimpa
  // view/dist/target. Dipakai untuk mereproduksi framing kartu instruction
  // persis seperti yang dilihat user.
  const eyeSpec = params.get('eye')?.split(',').map(Number);
  const view: [number, number, number] =
    eyeSpec?.length === 3
      ? (eyeSpec as [number, number, number])
      : [
          target[0] + dir[0] * dist,
          target[1] + dir[1] * dist,
          target[2] + dir[2] * dist,
        ];

  // `?off=3:378,9.5;4:329.6,12` — timpa offset (Y,Z) link tertentu tanpa perlu
  // mengedit armKinematics.ts, supaya beberapa nilai bisa dibandingkan cepat.
  const links = ARM_LINKS.map((l, i) => {
    const spec = (params.get('off') ?? '')
      .split(';')
      .find((s) => s.startsWith(`${i}:`));
    if (!spec) return l;
    const [y, z] = spec.slice(spec.indexOf(':') + 1).split(',').map(Number);
    return { ...l, offset: [0, y, z] as [number, number, number] };
  });

  // `?yaw=195.3` — timpa yaw scene (derajat) untuk menguji orientasi tampil.
  const yawSpec = params.get('yaw');
  const sceneYaw =
    yawSpec != null && yawSpec !== '' ? (Number(yawSpec) * Math.PI) / 180 : undefined;

  // `?cam=-1.4,-46.5,42` — geser posisi DSLR di frame flange (mm).
  const camSpec = params.get('cam');
  const camOffset =
    camSpec && camSpec !== '0'
      ? (camSpec.split(',').map(Number) as [number, number, number])
      : undefined;

  const setAngle = (i: number, v: number) =>
    setPose((p) => p.map((a, idx) => (idx === i ? v : a)));

  const poseText = `[${pose.map((a) => Math.round(a)).join(', ')}]`;

  return (
    <main className="flex h-full text-white">
      <div className="flex-1">
        <RobotArm3D
          pose={pose}
          links={links}
          cameraPosition={view}
          className="h-full w-full"
          showCamera={params.get('cam') !== '0'}
          cameraOffset={camOffset}
          sceneYaw={sceneYaw}
        >
          <OrbitControls makeDefault target={target} />
          <Grid
            args={[4, 4]}
            position={[0, -0.387, 0]}
            cellColor="#3f72af"
            sectionColor="#dbe2ef"
            fadeDistance={8}
          />
        </RobotArm3D>
      </div>

      <aside
        className={cn(
          'w-[420px] shrink-0 overflow-y-auto bg-[#112d4e]/90 p-6',
          !showHud && 'hidden',
        )}
      >
        <h1 className="mb-1 text-2xl font-bold">Arm calibration</h1>
        <p className="mb-5 text-sm text-white/50">
          Drag untuk memutar kamera. Setel joint lalu salin hasilnya ke
          PRESET_POSES.
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          {PRESET_POSES.map((p, i) => (
            <button
              key={i}
              onClick={() => setPose(p)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
            >
              P{i + 1}
            </button>
          ))}
          <button
            onClick={() => setPose(REST_POSE)}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          >
            Rest
          </button>
        </div>

        {ARM_LINKS.map((link, i) => (
          <div key={link.url} className="mb-4">
            <div className="mb-1 flex justify-between text-sm">
              <span>
                {i}. {link.label}{' '}
                <span className="text-white/40">({link.axis})</span>
              </span>
              <span className="tabular-nums text-white/70">
                {Math.round(pose[i] ?? 0)}°
              </span>
            </div>
            <input
              type="range"
              min={link.limit[0]}
              max={link.limit[1]}
              step={1}
              value={pose[i] ?? 0}
              onChange={(e) => setAngle(i, Number(e.target.value))}
              className="w-full"
            />
          </div>
        ))}

        <pre className="mt-4 overflow-x-auto rounded-lg bg-black/30 p-3 text-xs">
          {poseText}
        </pre>
        <button
          onClick={() => {
            navigator.clipboard.writeText(poseText);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="mt-2 w-full rounded-lg bg-[#3f72af] px-4 py-2 font-semibold hover:bg-[#3f72af]/80"
        >
          {copied ? 'Copied!' : 'Copy pose'}
        </button>

        <p className="mt-6 text-xs leading-5 text-white/40">
          Kalau sambungan antar link terlihat renggang atau tumpang tindih, yang
          perlu diubah adalah <code>offset</code> di armKinematics.ts (bukan
          sudut) — nilainya dalam mm pada frame link induk.
        </p>
      </aside>
    </main>
  );
}
