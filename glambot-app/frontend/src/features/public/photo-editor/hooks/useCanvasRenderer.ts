'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { fabric } from 'fabric';

/**
 * Options for the useCanvasRenderer hook
 */
interface UseCanvasRendererOptions {
  width?: number;
  height?: number;
  onReady?: (canvas: fabric.Canvas) => void;
}

const DEFAULT_CANVAS_WIDTH = 464;
const DEFAULT_CANVAS_HEIGHT = 696;

export const useCanvasRenderer = ({
  width = DEFAULT_CANVAS_WIDTH,
  height = DEFAULT_CANVAS_HEIGHT,
  onReady,
}: UseCanvasRendererOptions = {}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  // State-driven agar konsumer re-render saat canvas (re)dibuat — penting karena
  // canvas dibuat ulang ketika dimensi frame berubah (mis. 464×696 → 400×600).
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);

  // Stabilize onReady callback reference to avoid re-init on every render.
  // Disetel via effect (bukan saat render) agar tidak melanggar aturan refs.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Buat ulang canvas saat ukuran berubah. Dimensi diturunkan dari
  // frame.canvas_width/height (lihat PreviewArea), jadi tiap frame dirender di
  // ruang koordinat aslinya dan posisi slot selalu pas.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const canvas = new fabric.Canvas(canvasEl, {
      width,
      height,
      selection: false, // Disable multi-select (not needed for photo editor)
      renderOnAddRemove: true, // Auto re-render when objects are added/removed
      preserveObjectStacking: true, // Maintain z-index order on selection
    });

    fabricCanvasRef.current = canvas;
    setFabricCanvas(canvas);
    onReadyRef.current?.(canvas);

    // Cleanup saat unmount / sebelum re-init (StrictMode & perubahan dimensi).
    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
      setFabricCanvas(null);
    };
  }, [width, height]);

  // Stabil agar aman dipakai sebagai dependency effect konsumer.
  const getFabricCanvas = useCallback(() => fabricCanvasRef.current, []);

  return {
    /** Ref to attach to the <canvas> element */
    canvasRef,
    /** The Fabric.js canvas instance (null until initialized) */
    fabricCanvas,
    /** Get the current fabric canvas instance (always up-to-date via ref) */
    getFabricCanvas,
  };
};
