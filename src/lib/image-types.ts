export const MAX_MESSAGE_IMAGES = 10;

export interface ImageAttachment {
  id: string; name: string; mimeType: string; width: number; height: number; size: number; path: string;
  publicUrl?: string;
}
export type UserContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export function isImageAttachments(value: unknown): value is ImageAttachment[] {
  return Array.isArray(value) && value.length <= MAX_MESSAGE_IMAGES && value.every(image => image && typeof image === 'object' &&
    typeof image.id === 'string' && typeof image.name === 'string' && typeof image.path === 'string' && !image.path.includes('..') &&
    image.mimeType === 'image/jpeg' && Number.isInteger(image.width) && image.width > 0 && image.width <= 2048 &&
    Number.isInteger(image.height) && image.height > 0 && image.height <= 2048 &&
    Number.isInteger(image.size) && image.size > 0 && image.size <= 2097152 &&
    Object.keys(image).every(key => ['id', 'name', 'path', 'mimeType', 'width', 'height', 'size'].includes(key)));
}
