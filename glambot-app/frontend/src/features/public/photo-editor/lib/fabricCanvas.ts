import { fabric } from 'fabric';

// Load frame image as overlay (above photos)
export const loadFrameImage = async (
  canvas: fabric.Canvas,
  frameUrl: string,
): Promise<fabric.Image> => {
  return new Promise((resolve, reject) => {
    fabric.Image.fromURL(
      frameUrl,
      (img) => {
        if (!img) {
          reject(new Error('Failed to load frame image'));
          return;
        }

        img.set({
          left: 0,
          top: 0,
          selectable: false,
          evented: false,
          data: { isFrame: true },
        });

        // Scale to fit canvas
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();
        if (img.width && img.height) {
          img.scaleToWidth(canvasWidth);
          if (img.getScaledHeight() < canvasHeight) {
            img.scaleToHeight(canvasHeight);
          }
        }

        canvas.add(img);
        canvas.renderAll();
        resolve(img);
      },
      { crossOrigin: 'anonymous' },
    );
  });
};

// Remove photo by slot ID
export const removePhotoBySlotId = (
  canvas: fabric.Canvas,
  slotId: string,
): void => {
  const photo = canvas
    .getObjects()
    .find((obj) => obj.data?.isPhoto && obj.data?.slotId === slotId);
  if (photo) {
    canvas.remove(photo);
    canvas.renderAll();
  }
};

// Organize layers: photos → frame → drop zones
export const organizeCanvasLayers = (canvas: fabric.Canvas): void => {
  const objects = canvas.getObjects();
  const frameObjects = objects.filter((obj) => obj.data?.isFrame);
  const photoObjects = objects.filter((obj) => obj.data?.isPhoto);
  const dropZones = objects.filter((obj) => obj.data?.isDropZone);

  photoObjects.forEach((obj) => canvas.sendToBack(obj));
  frameObjects.forEach((obj) => canvas.bringToFront(obj));
  dropZones.forEach((obj) => canvas.bringToFront(obj));

  canvas.renderAll();
};
