/**
 * Image optimization utilities for avatar uploads.
 * Resize and compress images client-side before sending to backend.
 */

export interface OptimizedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalSize: number;
  optimizedSize: number;
}

/**
 * Convert a File/Blob to a base64 data URL.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Resize and compress an image file.
 * - maxWidth/maxHeight: cap on dimensions (keeps aspect ratio)
 * - maxSizeKB: soft cap on file size (may be slightly exceeded if quality=0.1 min)
 * - format: 'jpeg' (smaller, recommended) or 'png' (transparency, larger)
 *
 * Returns an OptimizedImage with the compressed blob + metadata.
 */
export async function optimizeImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    maxSizeKB?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
  } = {}
): Promise<OptimizedImage> {
  const {
    maxWidth = 256,
    maxHeight = 256,
    maxSizeKB = 100,
    quality = 0.85,
    format = 'jpeg',
  } = options;

  const originalSize = file.size;

  // Load image
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });

  let { width: w, height: h } = img;

  // Scale down if exceeding max dimensions (preserve aspect ratio)
  const scaleW = maxWidth / w;
  const scaleH = maxHeight / h;
  const scale = Math.min(1, scaleW, scaleH);
  if (scale < 1) {
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  // Draw resized
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);

  // Helper to get blob at target quality, with a floor
  const getBlob = (q: number): Promise<Blob> =>
    new Promise((resolve) => {
      const mimeType =
        format === 'png'
          ? 'image/png'
          : format === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
      canvas.toBlob(
        (blob) => resolve(blob!),
        mimeType,
        q
      );
    });

  // Binary search for quality to hit target size (max 8 iterations)
  let lo = 0.1;
  let hi = quality;
  let blob = await getBlob(quality);

  for (let i = 0; i < 8 && blob.size > maxSizeKB * 1024 && hi - lo > 0.05; i++) {
    const mid = (lo + hi) / 2;
    const testBlob = await getBlob(mid);
    if (testBlob.size <= blob.size) {
      blob = testBlob;
      hi = mid;
    } else {
      lo = mid;
    }
  }

  // One last check — if still too large, resize further
  if (blob.size > maxSizeKB * 1024) {
    let step = 0.5;
    while (blob.size > maxSizeKB * 1024 && w > 64 && h > 64) {
      w = Math.round(w * step);
      h = Math.round(h * step);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      blob = await getBlob(0.7);
    }
  }

  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    dataUrl,
    width: w,
    height: h,
    originalSize,
    optimizedSize: blob.size,
  };
}

/**
 * Read a file as base64 data URL (no resize).
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
