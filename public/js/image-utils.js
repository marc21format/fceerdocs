import {
  QUESTION_IMAGE_MAX_DIMENSION,
  QUESTION_IMAGE_JPEG_QUALITY
} from './config.js';

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

export async function loadImageFromDataUrl(dataUrl) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = dataUrl;
  });
  return image;
}

export function canvasHasTransparency(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) return true;
  }
  return false;
}

export async function readImageFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);
  return {
    dataUrl,
    width: image.naturalWidth || image.width || 0,
    height: image.naturalHeight || image.height || 0
  };
}

export async function readQuestionImageFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  if (file.type === "image/svg+xml" || dataUrl.startsWith("data:image/svg+xml")) {
    return readImageFile(file);
  }

  const image = await loadImageFromDataUrl(dataUrl);
  const sourceWidth = image.naturalWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.height || 0;
  if (!sourceWidth || !sourceHeight) {
    return { dataUrl, width: sourceWidth, height: sourceHeight };
  }

  const scale = Math.min(1, QUESTION_IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return { dataUrl, width: sourceWidth, height: sourceHeight };
  context.drawImage(image, 0, 0, width, height);

  const keepPng = file.type === "image/png" && canvasHasTransparency(canvas);
  const optimizedDataUrl = keepPng
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", QUESTION_IMAGE_JPEG_QUALITY);
  const useOptimized = optimizedDataUrl.length < dataUrl.length;

  return {
    dataUrl: useOptimized ? optimizedDataUrl : dataUrl,
    width: useOptimized ? width : sourceWidth,
    height: useOptimized ? height : sourceHeight
  };
}
