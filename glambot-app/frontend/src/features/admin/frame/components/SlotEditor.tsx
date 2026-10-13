'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/admin/ui/card';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Progress } from '@/components/admin/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select';
import { Label } from '@/components/admin/ui/label';
import { Trash2, Maximize2, Square, Circle } from 'lucide-react';
import { FrameSlot, SlotShape } from '../api/types';
import { useSlotEditor } from '../hooks/useSlotEditor';

interface SlotEditorProps {
  imageUrl: string | null;
  canvasWidth: number;
  canvasHeight: number;
  slots: FrameSlot[];
  onSlotsChange: (slots: FrameSlot[]) => void;
}

const TARGET_SLOT_OPTIONS = [
  { value: 2, label: '2 slots (2×1)' },
  { value: 4, label: '4 slots (2×2)' },
  { value: 6, label: '6 slots (3×2)' },
  { value: 8, label: '8 slots (4×2)' },
];

export function SlotEditor({
  imageUrl,
  canvasWidth,
  canvasHeight,
  slots,
  onSlotsChange,
}: SlotEditorProps) {
  const [slotShape, setSlotShape] = useState<SlotShape>('rect');
  const [targetSlotCount, setTargetSlotCount] = useState<number>(6);

  const {
    isDrawing,
    startPos,
    currentPos,
    editingSlot,
    handleMouseDown,
    handleSlotMouseDown,
    handleMouseMove,
    handleMouseUp,
    removeSlot,
    clearAll,
  } = useSlotEditor({
    canvasWidth,
    canvasHeight,
    slots,
    onSlotsChange,
    slotShape,
  });

  const progressValue = targetSlotCount
    ? Math.min(100, (slots.length / targetSlotCount) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Slot Configuration</h3>
          <p className="text-muted-foreground text-sm">
            Click and drag to create photo slots
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="px-3 py-1 text-base">
            {slots.length} Slots
          </Badge>
          {slots.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={clearAll}
            >
              <Trash2 className="mr-1 size-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Slot options */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Target Slots</Label>
              <Select
                value={String(targetSlotCount)}
                onValueChange={(value) => setTargetSlotCount(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target slots" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_SLOT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Slot Shape</Label>
              <Select
                value={slotShape}
                onValueChange={(value) => setSlotShape(value as SlotShape)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select slot shape" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rect">Rectangle</SelectItem>
                  <SelectItem value="ellipse">Ellipse</SelectItem>
                  <SelectItem value="circle">Circle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Progress</Label>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-blue-600">
                  {slots.length}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-muted-foreground text-lg">
                  {targetSlotCount}
                </span>
              </div>
              <Progress value={progressValue} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Canvas */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            {!imageUrl ? (
              <div className="flex h-96 items-center justify-center rounded-lg border-2 border-dashed">
                <p className="text-muted-foreground">Upload an image first</p>
              </div>
            ) : (
              <div
                data-canvas
                className="relative mx-auto cursor-crosshair overflow-hidden rounded-lg border-2"
                style={{
                  width: Math.min(canvasWidth, 600),
                  height: Math.min(canvasHeight, 800),
                  maxWidth: '100%',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                  // Don't reset state on mouse leave to prevent blink
                  // Only reset when explicitly handled
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Frame"
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                />

                {/* Drawing preview - only show when drawing new slot */}
                {isDrawing && (
                  <div
                    className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/20"
                    style={{
                      left: Math.min(startPos.x, currentPos.x),
                      top: Math.min(startPos.y, currentPos.y),
                      width: Math.abs(currentPos.x - startPos.x),
                      height: Math.abs(currentPos.y - startPos.y),
                      borderRadius:
                        slotShape === 'rect' ? '4px' : '50%',
                    }}
                  />
                )}

                {/* Slots */}
                {slots.map((slot, i) => (
                  <div
                    key={slot.id}
                    className={`group absolute border-2 transition-all ${
                      editingSlot === i
                        ? 'border-blue-500 bg-blue-500/30'
                        : 'border-red-500 bg-red-500/20 hover:bg-red-500/30'
                    }`}
                    style={{
                      left: slot.x,
                      top: slot.y,
                      width: slot.width,
                      height: slot.height,
                      borderRadius:
                        slot.shape === 'rect' ? '4px' : '50%',
                      cursor: editingSlot === i ? 'grabbing' : 'grab',
                    }}
                    onMouseDown={(e) => handleSlotMouseDown(e, i, 'move')}
                  >
                    <Badge className="absolute -top-6 left-0 text-xs">
                      #{i + 1}
                    </Badge>

                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="absolute -top-6 right-0 h-5 px-2 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSlot(i);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>

                    <div
                      className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize rounded-tl bg-blue-600 opacity-0 transition-opacity group-hover:opacity-100"
                      onMouseDown={(e) => handleSlotMouseDown(e, i, 'resize')}
                    >
                      <Maximize2 className="size-3 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Slot List */}
        <Card>
          <CardContent className="p-4">
            <h4 className="mb-3 font-semibold">Slot List</h4>
            {slots.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No slots defined yet
              </p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {slots.map((slot, i) => {
                  const ShapeIcon = slot.shape === 'rect' ? Square : Circle;
                  return (
                    <div
                      key={slot.id}
                      className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-2 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <ShapeIcon className="text-muted-foreground size-4" />
                        <span className="text-sm font-medium">
                          Slot #{i + 1}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeSlot(i)}
                        aria-label={`Remove slot ${i + 1}`}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm text-blue-900">
            <strong>Tips:</strong> Click and drag to create a slot. Drag a
            slot to move its position, or drag a corner to
            resize it.
          </p>
          <p className="text-xs text-blue-900/80">
            Define slots in reading order: top-left → top-right →
            middle-left → middle-right → bottom-left → bottom-right, and
            so on. This order determines the photo position in each slot when
            the frame is used.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
