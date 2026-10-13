import { useState, useCallback } from 'react';
import { FrameSlot, SlotShape } from '../api/types';

interface UseSlotEditorProps {
  canvasWidth: number;
  canvasHeight: number;
  slots: FrameSlot[];
  onSlotsChange: (slots: FrameSlot[]) => void;
  slotShape?: SlotShape;
}

export function useSlotEditor({
  canvasWidth,
  canvasHeight,
  slots,
  onSlotsChange,
  slotShape = 'rect',
}: UseSlotEditorProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<'move' | 'resize' | null>(null);
  const [editStartPos, setEditStartPos] = useState({ x: 0, y: 0 });
  const [originalSlot, setOriginalSlot] = useState<FrameSlot | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (editingSlot !== null) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);
      setStartPos({ x, y });
      setCurrentPos({ x, y });
      setIsDrawing(true);
    },
    [editingSlot],
  );

  const handleSlotMouseDown = useCallback(
    (e: React.MouseEvent, index: number, mode: 'move' | 'resize') => {
      e.stopPropagation();
      setEditingSlot(index);
      setEditMode(mode);
      setOriginalSlot({ ...slots[index] });

      const canvas = e.currentTarget.closest('[data-canvas]') as HTMLElement;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setEditStartPos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    },
    [slots],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (editingSlot !== null && editMode && originalSlot) {
        const rect = e.currentTarget.getBoundingClientRect();
        const currentX = Math.round(e.clientX - rect.left);
        const currentY = Math.round(e.clientY - rect.top);

        const deltaX = currentX - editStartPos.x;
        const deltaY = currentY - editStartPos.y;

        const updatedSlots = [...slots];

        if (editMode === 'move') {
          updatedSlots[editingSlot] = {
            ...originalSlot,
            x: Math.max(
              0,
              Math.min(
                canvasWidth - originalSlot.width,
                originalSlot.x + deltaX,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                canvasHeight - originalSlot.height,
                originalSlot.y + deltaY,
              ),
            ),
          };
        } else if (editMode === 'resize') {
          const newWidth = Math.max(30, originalSlot.width + deltaX);
          const newHeight = Math.max(30, originalSlot.height + deltaY);

          updatedSlots[editingSlot] = {
            ...originalSlot,
            width: Math.min(newWidth, canvasWidth - originalSlot.x),
            height: Math.min(newHeight, canvasHeight - originalSlot.y),
          };
        }

        onSlotsChange(updatedSlots);
        return;
      }

      if (!isDrawing) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);
      setCurrentPos({ x, y });
    },
    [
      editingSlot,
      editMode,
      originalSlot,
      slots,
      canvasWidth,
      canvasHeight,
      isDrawing,
      editStartPos,
      onSlotsChange,
    ],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (editingSlot !== null) {
        setEditingSlot(null);
        setEditMode(null);
        setOriginalSlot(null);
        return;
      }

      if (!isDrawing) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const endX = Math.round(e.clientX - rect.left);
      const endY = Math.round(e.clientY - rect.top);

      const width = Math.abs(endX - startPos.x);
      const height = Math.abs(endY - startPos.y);

      if (width >= 30 && height >= 30) {
        const labels = [
          'Top Left',
          'Top Right',
          'Middle Left',
          'Middle Right',
          'Bottom Left',
          'Bottom Right',
          'Center Top',
          'Center Bottom',
        ];

        const slot: FrameSlot = {
          id: `slot-${slots.length + 1}`,
          shape: slotShape,
          x: Math.min(startPos.x, endX),
          y: Math.min(startPos.y, endY),
          width,
          height,
          label: labels[slots.length] || `Slot ${slots.length + 1}`,
        };

        onSlotsChange([...slots, slot]);
      }

      setIsDrawing(false);
      setCurrentPos({ x: 0, y: 0 });
    },
    [editingSlot, isDrawing, startPos, slots, onSlotsChange, slotShape],
  );

  const removeSlot = useCallback(
    (index: number) => {
      onSlotsChange(slots.filter((_, i) => i !== index));
    },
    [slots, onSlotsChange],
  );

  const clearAll = useCallback(() => {
    onSlotsChange([]);
  }, [onSlotsChange]);

  const reset = useCallback(() => {
    onSlotsChange([]);
    setIsDrawing(false);
    setCurrentPos({ x: 0, y: 0 });
    setEditingSlot(null);
    setEditMode(null);
    setOriginalSlot(null);
  }, [onSlotsChange]);

  return {
    slots,
    isDrawing,
    startPos,
    currentPos,
    editingSlot,
    editMode,
    handleMouseDown,
    handleSlotMouseDown,
    handleMouseMove,
    handleMouseUp,
    removeSlot,
    clearAll,
    reset,
  };
}
