'use client';

import { useState, useCallback, useMemo } from 'react';
import { fabric } from 'fabric';
import type { FilterType } from '../pages/PhotoEditorPage';
import type { Frame } from '../api/getFrames';

/**
 * State for a single slot in the composition
 */
export interface SlotState {
  slotId: string;
  photoId: string | null;
  photoUrl: string | null;
  fabricImage: fabric.Image | null;
}

/**
 * Create initial empty slot state based on frame
 */
const createInitialSlots = (frame: Frame | null): Record<string, SlotState> => {
  const slots: Record<string, SlotState> = {};

  if (frame?.slots) {
    for (const slot of frame.slots) {
      slots[slot.id] = {
        slotId: slot.id,
        photoId: null,
        photoUrl: null,
        fabricImage: null,
      };
    }
    return slots;
  }

  // Fallback: create 6 default slots if no frame selected
  for (let i = 1; i <= 6; i++) {
    const id = `slot-${i}`;
    slots[id] = {
      slotId: id,
      photoId: null,
      photoUrl: null,
      fabricImage: null,
    };
  }
  return slots;
};

export const usePhotoComposition = () => {
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [slots, setSlots] = useState<Record<string, SlotState>>(() =>
    createInitialSlots(null),
  );
  const [filter, setFilter] = useState<FilterType>('original');

  // Get total slot count from frame
  const totalSlotCount = useMemo(() => {
    return selectedFrame?.slots.length ?? 6;
  }, [selectedFrame]);

  // Update slots when frame changes
  const updateFrame = useCallback((newFrame: Frame | null) => {
    setSelectedFrame(newFrame);
    setSlots(createInitialSlots(newFrame));
  }, []);

  /**
   * Add a photo to a specific slot.
   * If the slot already has a photo, it will be replaced.
   */
  const addPhotoToSlot = useCallback(
    (
      slotId: string,
      photoId: string,
      photoUrl: string,
      fabricImage: fabric.Image | null = null,
    ) => {
      setSlots((prev) => ({
        ...prev,
        [slotId]: {
          slotId,
          photoId,
          photoUrl,
          fabricImage,
        },
      }));
    },
    [],
  );

  /**
   * Remove a photo from a specific slot, resetting it to empty.
   */
  const removePhotoFromSlot = useCallback((slotId: string) => {
    setSlots((prev) => ({
      ...prev,
      [slotId]: {
        slotId,
        photoId: null,
        photoUrl: null,
        fabricImage: null,
      },
    }));
  }, []);

  /**
   * Clear all slots back to their initial empty state.
   */
  const clearAllSlots = useCallback(() => {
    setSlots(createInitialSlots(selectedFrame));
  }, [selectedFrame]);

  /**
   * Update the Fabric.js image reference for a slot
   */
  const setSlotFabricImage = useCallback(
    (slotId: string, fabricImage: fabric.Image | null) => {
      setSlots((prev) => ({
        ...prev,
        [slotId]: {
          ...prev[slotId],
          fabricImage,
        },
      }));
    },
    [],
  );

  /**
   * Check whether all slots have a photo assigned.
   */
  const allSlotsFilled = Object.values(slots).every((s) => s.photoId !== null);

  /**
   * Count how many slots currently have a photo.
   */
  const filledSlotCount = Object.values(slots).filter(
    (s) => s.photoId !== null,
  ).length;

  return {
    // State
    slots,
    selectedFrame,
    filter,
    allSlotsFilled,
    filledSlotCount,
    totalSlotCount,

    // Slot actions
    addPhotoToSlot,
    removePhotoFromSlot,
    clearAllSlots,
    setSlotFabricImage,

    // Frame & filter actions
    setFrame: updateFrame,
    setFilter,
  };
};
