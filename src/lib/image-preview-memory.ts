import type { ImageAttachment } from './image-types';

// Follow the live attachment object from the composer into its sent message.
// Data URLs need no object-URL lifetime management; WeakMap releases thumbnails
// with their attachments and never reuses them for a different loaded account.
const fullImages = new WeakMap<ImageAttachment, string>();
export function uploadedFullImagePreview(image: ImageAttachment): string | undefined {
  return fullImages.get(image);
}

const thumbnails = new WeakMap<ImageAttachment, string>();
export function uploadedImagePreview(image: ImageAttachment): string | undefined {
  return thumbnails.get(image);
}

export async function rememberUploadedImagePreview(image: ImageAttachment, file: File): Promise<void> {
  try {
    const bitmap = await createImageBitmap(file, {
      resizeWidth: image.width,
      resizeHeight: image.height,
      imageOrientation: 'from-image',
    });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      fullImages.set(image, canvas.toDataURL('image/jpeg', 0.9));
      canvas.width = canvas.height = 128;
      const side = Math.min(bitmap.width, bitmap.height);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 128, 128);
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 128, 128);
      thumbnails.set(image, canvas.toDataURL('image/jpeg', 0.85));
    } finally {
      bitmap.close();
    }
  } catch { /* Preview optimization is optional; the stored image remains available. */ }
}
