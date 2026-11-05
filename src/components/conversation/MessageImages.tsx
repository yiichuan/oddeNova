import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImageOff, LoaderCircle, X } from 'lucide-react';
import { uploadedFullImagePreview, uploadedImagePreview } from '../../lib/image-preview-memory';
import { previewImageUrl } from '../../lib/image-cache';
import type { ImageAttachment } from '../../lib/image-attachments';
import { zh } from '../../lib/i18n';

type PreviewOrigin = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

function previewFrames(element: HTMLImageElement, origin: PreviewOrigin): Keyframe[] | undefined {
  const target = element.getBoundingClientRect();
  if (!target.width || !target.height || !origin.width || !origin.height) return;
  const scale = Math.max(origin.width / target.width, origin.height / target.height);
  const dx = origin.left + origin.width / 2 - target.left - target.width / 2;
  const dy = origin.top + origin.height / 2 - target.top - target.height / 2;
  const cropX = Math.max(0, (1 - origin.width / (target.width * scale)) * 50);
  const cropY = Math.max(0, (1 - origin.height / (target.height * scale)) * 50);
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, clipPath: `inset(${cropY}% ${cropX}% round 8px)` },
    { transform: 'translate(0, 0) scale(1)', clipPath: 'inset(0% 0% round 2px)' },
  ];
}

function Picture({ image, onPreview, previewUrl, origin }: { image: ImageAttachment; onPreview?: (url: string, origin: PreviewOrigin) => void; previewUrl?: string; origin?: PreviewOrigin }) {
  const animated = useRef(false);
  const cachedPreview = onPreview ? uploadedImagePreview(image) : uploadedFullImagePreview(image);
  const localPreview = previewUrl ?? cachedPreview;
  const [url, setUrl] = useState(localPreview ?? '');
  const [loaded, setLoaded] = useState(Boolean(cachedPreview));
  const [failed, setFailed] = useState(false);
  // A viewer image that grows from its thumbnail stays hidden until the growth
  // starts: a cached image paints at full size before onLoad runs, which would
  // flash the whole picture and then snap back to the thumbnail to animate.
  const [revealed, setRevealed] = useState(!origin);
  useEffect(() => {
    if (localPreview) return;
    let active = true;
    let objectUrl = '';
    previewImageUrl(image).then(url => {
      objectUrl = url;
      if (active) setUrl(url);
      else if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    };
  }, [image, localPreview]);

  if (failed) {
    const label = zh ? '图片已过期' : 'Image expired';
    return <div role="img" aria-label={label} title={label}
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-surface-hover text-text-muted">
      <ImageOff size={23} strokeWidth={1.4} aria-hidden="true" />
    </div>;
  }
  if (!url) return <div role="status" aria-label={zh ? '图片加载中' : 'Loading image'}
    className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-hover">
    <LoaderCircle size={22} className="animate-spin text-text-muted motion-reduce:animate-none" aria-hidden="true" />
  </div>;

  const picture = <img src={url} alt={image.name}
    className={onPreview ? 'h-full w-full object-cover object-center' : `max-h-full max-w-full rounded-sm object-contain shadow-[0_12px_48px_rgba(0,0,0,0.18)]${revealed ? '' : ' opacity-0'}`}
    onLoad={event => {
      setLoaded(true);
      if (!origin || animated.current) return;
      animated.current = true;
      const element = event.currentTarget;
      const frames = typeof element.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? previewFrames(element, origin) : undefined;
      if (frames) element.animate(frames, { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      // Unhide on the element itself, in the same task as animate(), so the
      // first painted frame is already the animation's start.
      element.classList.remove('opacity-0');
      setRevealed(true);
    }} loading={onPreview ? 'lazy' : 'eager'} onError={() => setFailed(true)} />;
  return onPreview ? (
    <button type="button" onClick={event => onPreview(uploadedFullImagePreview(image) ?? url, event.currentTarget.getBoundingClientRect())} aria-label={`${zh ? '预览图片' : 'Preview image'} ${image.name}`}
      data-image-thumbnail={image.id} aria-haspopup="dialog" className="relative h-16 w-16 shrink-0 overflow-hidden cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
      <div className={`flex h-full w-full items-center justify-center ${!loaded ? 'blur-sm brightness-75' : ''}`}>{picture}</div>
      {!loaded && <span role="status" aria-label={zh ? '图片加载中' : 'Loading image'} className="absolute inset-0 flex items-center justify-center bg-black/15">
        <LoaderCircle size={22} className="animate-spin text-white motion-reduce:animate-none" aria-hidden="true" />
      </span>}
    </button>
  ) : picture;
}

function ImageViewer({ images, initialIndex, initialUrl, origin, getOrigin, onClose }: {
  images: ImageAttachment[]; initialIndex: number; initialUrl: string; origin: PreviewOrigin; getOrigin: (id: string) => PreviewOrigin | undefined; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const exitAnimation = useRef<Animation | null>(null);
  const [index, setIndex] = useState(initialIndex);
  const [hasNavigated, setHasNavigated] = useState(false);
  const image = images[index];
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 280, pseudoElement: '::backdrop' });
    }
    document.body.style.overflow = 'hidden';
    return () => {
      if (exitAnimation.current) {
        exitAnimation.current.onfinish = null;
        exitAnimation.current.oncancel = null;
        exitAnimation.current.cancel();
      }
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const closePreview = () => {
    if (closing.current) return;
    closing.current = true;
    const element = dialog.current?.querySelector('img');
    const destination = getOrigin(image.id) ?? (index === initialIndex ? origin : undefined);
    if (!element?.animate || !destination || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    const currentStyle = getComputedStyle(element);
    const currentFrame = { transform: currentStyle.transform, clipPath: currentStyle.clipPath === 'none' || !currentStyle.clipPath ? 'inset(0% 0% round 2px)' : currentStyle.clipPath };
    element.getAnimations?.().forEach(animation => animation.cancel());
    const frames = previewFrames(element, destination);
    if (!frames) { onClose(); return; }
    const animation = element.animate([currentFrame, frames[0]], {
      duration: 220, easing: 'cubic-bezier(0.4, 0, 0.8, 0.2)', fill: 'forwards',
    });
    exitAnimation.current = animation;
    animation.onfinish = onClose;
    animation.oncancel = onClose;
    dialog.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards', pseudoElement: '::backdrop' });
    dialog.current?.querySelectorAll('button').forEach(button => button.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }));
  };
  const move = (direction: number) => {
    if (!closing.current) {
      setHasNavigated(true);
      setIndex(current => (current + direction + images.length) % images.length);
    }
  };
  const controlClass = 'flex size-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/85 text-neutral-800 shadow-sm transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700';
  return createPortal(
    <dialog ref={dialog} aria-label={zh ? '图片预览' : 'Image preview'}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-neutral-800 outline-none backdrop:bg-white/25 backdrop:backdrop-blur-[3px]"
      onCancel={event => { event.preventDefault(); closePreview(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}>
      <div className="flex h-full flex-col" onClick={event => { if (event.target === event.currentTarget) closePreview(); }}>
        <header className="flex shrink-0 items-center justify-end gap-3 px-4 py-3 sm:px-6">
          {images.length > 1 && <span className="text-xs tabular-nums text-neutral-500" aria-live="polite">{index + 1} / {images.length}</span>}
          <button type="button" onClick={closePreview} aria-label={zh ? '关闭预览' : 'Close preview'} className={controlClass}><X size={20} /></button>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-3 pb-6 sm:gap-5 sm:px-6"
          onClick={event => { if (event.target === event.currentTarget) closePreview(); }}>
          {images.length > 1 && <button type="button" onClick={() => move(-1)} aria-label={zh ? '上一张图片' : 'Previous image'} className={controlClass}><ChevronLeft size={22} /></button>}
          <div className="flex h-full min-w-0 flex-1 items-center justify-center" onClick={event => { if (event.target === event.currentTarget) closePreview(); }}>
            <Picture key={image.id} image={image} origin={!hasNavigated ? origin : undefined} previewUrl={index === initialIndex ? initialUrl : undefined} />
          </div>
          {images.length > 1 && <button type="button" onClick={() => move(1)} aria-label={zh ? '下一张图片' : 'Next image'} className={controlClass}><ChevronRight size={22} /></button>}
        </div>
      </div>
    </dialog>, document.body,
  );
}

export default function MessageImages({ images, previewUrls }: { images?: ImageAttachment[]; previewUrls?: Record<string, string> }) {
  const gallery = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ index: number; url: string; origin: PreviewOrigin } | null>(null);
  if (!images?.length) return null;
  return <div ref={gallery} className="flex flex-wrap gap-2 py-2">
    {images.map((image, index) => <Picture key={image.id} image={image} previewUrl={previewUrls?.[image.id]} onPreview={(url, origin) => setSelection({ index, url, origin })} />)}
    {selection !== null && <ImageViewer key={images.map(image => image.id).join(',')} images={images}
      initialIndex={Math.min(selection.index, images.length - 1)} initialUrl={selection.url} origin={selection.origin} getOrigin={id => Array.from(gallery.current?.querySelectorAll<HTMLElement>('[data-image-thumbnail]') ?? [])
        .find(element => element.dataset.imageThumbnail === id)?.getBoundingClientRect()} onClose={() => setSelection(null)} />}
  </div>;
}
