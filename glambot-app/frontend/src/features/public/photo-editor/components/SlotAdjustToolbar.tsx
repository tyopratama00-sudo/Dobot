'use client';

import { ZoomIn, ZoomOut, RotateCcw, RotateCw, RefreshCw } from 'lucide-react';

interface SlotAdjustToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onReset: () => void;
}

interface ToolButtonProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolButton({ label, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // onMouseDown + preventDefault: jangan rebut "active object" dari canvas
      // saat tombol ditekan, supaya handler tetap dapat foto yang sedang dipilih.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-12 w-12 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-[#3F72AF]/60 hover:text-white active:bg-[#3F72AF]"
    >
      {children}
    </button>
  );
}

/**
 * Toolbar kontekstual (Opsi A) untuk mengatur foto di dalam slot.
 * Muncul mengambang di atas preview saat sebuah foto dipilih.
 */
export default function SlotAdjustToolbar({
  onZoomIn,
  onZoomOut,
  onRotateLeft,
  onRotateRight,
  onReset,
}: SlotAdjustToolbarProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border-2 border-white/75 bg-primary/75 px-2 py-1.5 shadow-[0px_5.38px_26.92px_0px_rgba(17,45,78,0.5)] backdrop-blur-md">
      <ToolButton label="Zoom out" onClick={onZoomOut}>
        <ZoomOut className="h-6 w-6" />
      </ToolButton>
      <ToolButton label="Zoom in" onClick={onZoomIn}>
        <ZoomIn className="h-6 w-6" />
      </ToolButton>

      <span className="mx-1 h-7 w-px bg-white/25" />

      <ToolButton label="Rotate left" onClick={onRotateLeft}>
        <RotateCcw className="h-6 w-6" />
      </ToolButton>
      <ToolButton label="Rotate right" onClick={onRotateRight}>
        <RotateCw className="h-6 w-6" />
      </ToolButton>

      <span className="mx-1 h-7 w-px bg-white/25" />

      <ToolButton label="Reset" onClick={onReset}>
        <RefreshCw className="h-6 w-6" />
      </ToolButton>
    </div>
  );
}
