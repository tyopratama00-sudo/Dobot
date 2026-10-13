'use client';

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  ARM_LINKS,
  ARM_SCALE,
  CAMERA_MODEL,
  PRESET_POSES,
  REST_POSE,
  SCENE_YAW,
  type ArmPose,
  type ArmLink,
} from '../lib/armKinematics';

const DEG = Math.PI / 180;

/** Kecepatan easing pose (per detik). Makin besar makin cepat "snap". */
const POSE_LERP_SPEED = 3.2;

/**
 * Pergeseran vertikal arm di world space.
 *
 * Preset asli robot menjangkau dari +1167 mm sampai −315 mm relatif basisnya
 * (robot aslinya dipasang tinggi, jadi ia memang menunduk ke bawah basis).
 * Titik tengah rentang itu ada di 426 mm; digeser −426/1100 supaya seluruh
 * jangkauan ter-frame simetris terhadap titik pandang kamera.
 */
export const ARM_FLOOR_Y = -0.387;

interface LinkNodeProps {
  index: number;
  /** Rantai link yang dipakai — bisa versi ter-override dari /arm-lab. */
  links: ArmLink[];
  /** Ref array sudut aktual (radian) yang di-update tiap frame oleh useFrame. */
  angles: React.RefObject<number[]>;
  children?: ReactNode;
}

/**
 * Satu link: group joint (dirotasi tiap frame) berisi mesh link + link anak.
 *
 * Mesh di-clone karena useGLTF meng-cache satu instance scene per URL — tanpa
 * clone, merender arm di dua tempat sekaligus (mis. kartu intro + /arm-lab)
 * akan saling mencuri node.
 */
function LinkNode({ index, links, angles, children }: LinkNodeProps) {
  const link = links[index];
  const { scene } = useGLTF(link.url, false, true);
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  const joint = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = joint.current;
    if (!g) return;
    const a = angles.current[index] ?? 0;
    if (link.axis === 'x') g.rotation.x = a;
    else if (link.axis === 'y') g.rotation.y = a;
    else g.rotation.z = a;
  });

  return (
    <group position={link.offset}>
      <group ref={joint}>
        <primitive object={model} />
        {children}
      </group>
    </group>
  );
}

/**
 * Membangun rantai bersarang 1 → 2 → ... → 7 secara rekursif. `tip` diselipkan
 * di dalam link terakhir, sehingga apapun yang dipasang di sana ikut bergerak
 * mengikuti flange — dipakai untuk menempelkan badge kamera.
 */
function buildChain(
  i: number,
  links: ArmLink[],
  angles: React.RefObject<number[]>,
  tip: ReactNode,
): ReactNode {
  if (i >= links.length) return tip;
  return (
    <LinkNode index={i} links={links} angles={angles}>
      {buildChain(i + 1, links, angles, tip)}
    </LinkNode>
  );
}

/** Bodi DSLR yang menempel di flange, ikut bergerak bersama link terakhir. */
function CameraHead({ offset }: { offset?: [number, number, number] }) {
  const { scene } = useGLTF(CAMERA_MODEL.url, false, true);
  const model = useMemo(() => scene.clone(true), [scene]);
  // `offset` dinyatakan di frame link 7 (Z = sumbu flange, −X = arah bidik).
  return (
    <primitive
      object={model}
      rotation={CAMERA_MODEL.rotation}
      position={offset ?? CAMERA_MODEL.position}
    />
  );
}

interface ArmRigProps {
  pose: ArmPose;
  links: ArmLink[];
  tip: ReactNode;
  /** Yaw scene (radian). */
  yaw: number;
}

/**
 * Rig arm: memegang state sudut aktual dan meng-easing-nya ke `pose` target.
 * Interpolasi dilakukan di useFrame (bukan CSS/React state) supaya transisi
 * antar preset mulus tanpa memicu re-render tiap frame.
 */
function ArmRig({ pose, links, tip, yaw }: ArmRigProps) {
  // Sudut awal = pose pertama, bukan REST_POSE — supaya arm sudah berada di
  // pose yang benar pada frame pertama (tanpa "ayunan" masuk saat kartu baru
  // muncul), dan supaya screenshot statis di /arm-lab langsung akurat.
  const angles = useRef<number[]>(pose.map((d) => d * DEG));
  const target = useRef<number[]>(pose.map((d) => d * DEG));

  // Pose target di-commit lewat effect (bukan saat render) supaya tidak
  // menulis ref selagi render — useFrame membacanya di frame berikutnya.
  useEffect(() => {
    target.current = pose.map((d) => d * DEG);
  }, [pose]);

  useFrame((_, delta) => {
    const t = Math.min(1, delta * POSE_LERP_SPEED);
    for (let i = 0; i < angles.current.length; i++) {
      const to = target.current[i] ?? 0;
      angles.current[i] += (to - angles.current[i]) * t;
    }
  });

  // `position` berada di frame induk (belum ter-scale), jadi satuannya world:
  // arm setinggi ~1,16 unit setelah di-scale, diturunkan ARM_FLOOR_Y supaya
  // pusat massanya jatuh di tengah viewport, bukan di bawah kamera.
  return (
    <group
      scale={ARM_SCALE}
      position={[0, ARM_FLOOR_Y, 0]}
      rotation={[0, yaw, 0]}
    >
      {buildChain(0, links, angles, tip)}
    </group>
  );
}

/**
 * Pencahayaan lokal (bukan drei <Environment>), karena preset environment drei
 * mengunduh HDR dari CDN — kiosk ini harus tetap jalan tanpa internet.
 */
function Lights() {
  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#dbe2ef', '#112d4e', 1.1]} />
      <directionalLight position={[3, 5, 4]} intensity={2.4} />
      <directionalLight position={[-4, 2, -3]} intensity={1.1} color="#3f72af" />
      <pointLight position={[0, 1.2, 2.5]} intensity={2} color="#dbe2ef" />
    </>
  );
}

export interface RobotArm3DProps {
  /** Indeks preset aktif (0-9). Di luar rentang → REST_POSE. */
  presetIndex?: number;
  /** Pose eksplisit — menang atas presetIndex. Dipakai halaman kalibrasi. */
  pose?: ArmPose;
  /**
   * Posisi kamera world-space. Default menghadap arm dari arah +Z karena
   * bidang gerak arm adalah XY — dari sisi lain tekukannya jadi tersamar.
   */
  cameraPosition?: [number, number, number];
  /** Override rantai link — dipakai /arm-lab untuk menyetel offset live. */
  links?: ArmLink[];
  /** Pasang bodi DSLR 3D di flange. Matikan untuk melihat flange telanjang. */
  showCamera?: boolean;
  /** Override posisi DSLR di frame flange (mm) — dipakai /arm-lab. */
  cameraOffset?: [number, number, number];
  /** Override yaw scene (radian) — dipakai /arm-lab untuk menguji orientasi. */
  sceneYaw?: number;
  className?: string;
  children?: ReactNode;
}

export default function RobotArm3D({
  presetIndex = 0,
  pose,
  // Jarak ~2.3 diturunkan dari kotak batas 10 preset asli: setengah rentang
  // tinggi 0,67 unit / tan(fov/2 = 20°) ≈ 1,85, ditambah margin. Arah pandang
  // sedikit dari atas-samping supaya tekukan bidang XY tetap terbaca.
  cameraPosition = [0.49, 0.29, 1.81],
  links = ARM_LINKS,
  showCamera = true,
  cameraOffset,
  sceneYaw,
  className,
  children,
}: RobotArm3DProps) {
  const activePose = pose ?? PRESET_POSES[presetIndex] ?? REST_POSE;
  // Satu yaw untuk semua preset (lihat SCENE_YAW). /arm-lab bisa menimpanya
  // lewat ?yaw= untuk menguji nilai lain tanpa mengedit konstanta.
  const yaw = sceneYaw ?? SCENE_YAW;

  // Dipasang di frame link 7 (dudukan kamera), sehingga ikut bergerak
  // mengikuti flange.
  const tip = showCamera ? <CameraHead offset={cameraOffset} /> : null;

  return (
    <div className={className}>
      <Canvas
        camera={{ position: cameraPosition, fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Lights />
        <Suspense fallback={null}>
          <ArmRig pose={activePose} links={links} tip={tip} yaw={yaw} />
        </Suspense>
        {children}
      </Canvas>
    </div>
  );
}

// Prefetch semua link supaya pergantian preset tidak memunculkan pop-in.
ARM_LINKS.forEach((l) => useGLTF.preload(l.url, false, true));
useGLTF.preload(CAMERA_MODEL.url, false, true);
