import { ROUTER_STREAM_LINE_REVEAL_MS } from '../../agent/progress';

type Line = { top: number; bottom: number };

function addedLines(element: HTMLElement, previousLength: number): Line[] {
  const height = element.offsetHeight;
  if (!height) return [];

  const bounds = element.getBoundingClientRect();
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return [{ top: 0, bottom: height }];

  let previousBottom = 0;
  let remaining = previousLength;
  const rects: Line[] = [];
  const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let text = texts.nextNode(); text; text = texts.nextNode()) {
    const length = text.textContent?.length ?? 0;
    if (!length) continue;
    const start = Math.min(remaining, length);
    if (remaining > 0 && remaining <= length) {
      range.setStart(text, start - 1);
      range.setEnd(text, start);
      const last = range.getClientRects()[0];
      if (last) previousBottom = Math.max(0, last.bottom - bounds.top);
    }
    remaining -= start;
    if (start === length) continue;
    range.setStart(text, start);
    range.setEnd(text, length);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width && rect.height) {
        rects.push({ top: rect.top - bounds.top, bottom: rect.bottom - bounds.top });
      }
    }
  }

  const visualLines: Line[] = [];
  for (const rect of rects.sort((a, b) => a.top - b.top)) {
    // Text split by Markdown and highlighting still shares a line.
    const last = visualLines.at(-1);
    if (last && rect.top < last.bottom - 1) last.bottom = Math.max(last.bottom, rect.bottom);
    else visualLines.push(rect);
  }

  let top = previousBottom;
  const lines: Line[] = [];
  for (const rect of visualLines) {
    const bottom = Math.min(height, rect.bottom);
    if (bottom <= top + 1) continue;
    lines.push({ top, bottom });
    top = bottom;
  }
  const last = lines.at(-1);
  if (last) last.bottom = height;
  return lines;
}

const sweepMask = 'linear-gradient(to right, #000 49%, transparent 53%)';
// Soften the blur layer's horizontal edges where a line band crops the blur.
// The clear layer keeps hard edges so previously revealed text stays crisp.
const blurBandMask = 'linear-gradient(to bottom, transparent, #000 2px, #000 calc(100% - 2px), transparent)';
const clearStart = 0.18;
const blurEnd = 0.82;
const MAX_BATCH_REVEAL_MS = 2400;

// Position of each mask relative to the text. The clear edge starts before
// the blurred edge reaches the right side, and both finish on the same line.
function sweepPosition(time: number, start: number, end: number): number {
  return 100 * (1 - Math.min(1, Math.max(0, (time - start) / (end - start))));
}

function lineFrames(lines: Line[], blurred: boolean): Keyframe[] {
  return lines.flatMap(({ top, bottom }, index) =>
    [0, clearStart, blurEnd, 1].map(time => {
      const band = `240% ${bottom - top}px`;
      const clear = sweepPosition(time, clearStart, 1);
      const blur = sweepPosition(time, 0, blurEnd);
      return {
        offset: (index + time) / lines.length,
        maskImage: blurred ? `${blurBandMask}, ${sweepMask}, ${sweepMask}` : `linear-gradient(#000, #000), ${sweepMask}`,
        maskComposite: blurred ? 'intersect, subtract' : 'add',
        maskSize: blurred ? `100% ${bottom - top}px, ${band}, ${band}` : `100% ${top}px, ${band}`,
        maskRepeat: 'no-repeat',
        maskPosition: blurred ? `0px ${top}px, ${blur}% ${top}px, ${clear}% ${top}px` : `0px 0px, ${clear}% ${top}px`,
      };
    }),
  );
}

function createBlurLayer(element: HTMLElement, overlay: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  const bounds = element.getBoundingClientRect();
  const origin = overlay.getBoundingClientRect();
  const style = getComputedStyle(element);
  // Preserve the rendered markup and typography, but keep the copy outside
  // the document's accessibility tree and the flow of conversation messages.
  for (const node of [clone, ...clone.querySelectorAll('*')]) {
    node.removeAttribute('id');
    for (const name of node.getAttributeNames()) {
      if (name.startsWith('data-') && name !== 'data-music-token') node.removeAttribute(name);
    }
  }
  clone.inert = true;
  clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, {
    position: 'absolute',
    top: `${bounds.top - origin.top}px`,
    left: `${bounds.left - origin.left}px`,
    width: `${bounds.width}px`,
    maxWidth: 'none',
    height: `${bounds.height}px`,
    boxSizing: 'border-box',
    margin: '0',
    animation: 'none',
    filter: 'blur(2px)',
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    whiteSpace: style.whiteSpace,
    direction: style.direction,
    overflowWrap: style.overflowWrap,
  });
  overlay.append(clone);
  return clone;
}

export function revealStreamBatch(
  scroll: HTMLElement,
  overlay: HTMLElement,
  previousText: WeakMap<HTMLElement, string>,
  startDelay = 0,
) {
  const batch: { element: HTMLElement; lines: Line[] }[] = [];
  let totalLines = 0;
  for (const element of scroll.querySelectorAll<HTMLElement>('[data-live-router-progress], [data-live-batch-text]')) {
    const text = element.textContent ?? '';
    const previous = previousText.get(element);
    if (!text || previous === text) continue;
    previousText.set(element, text);
    if (typeof element.animate !== 'function') continue;

    const lines = addedLines(element, previous && text.startsWith(previous) ? previous.length : 0);
    if (!lines.length) continue;
    batch.push({ element, lines });
    totalLines += lines.length;
  }
  if (!totalLines) return;

  const lineDuration = Math.min(ROUTER_STREAM_LINE_REVEAL_MS, MAX_BATCH_REVEAL_MS / totalLines);
  const cleanup: (() => void)[] = [];
  let delay = startDelay;
  for (const { element, lines } of batch) {
    const duration = lines.length * lineDuration;
    const timing = { delay, duration, fill: 'backwards' as const };
    const clone = createBlurLayer(element, overlay);
    const blur = clone.animate?.(lineFrames(lines, true), timing);
    if (blur) blur.onfinish = () => clone.remove();
    else clone.remove();
    const clear = element.animate(lineFrames(lines, false), timing);
    cleanup.push(() => {
      clear?.cancel();
      blur?.cancel();
      clone.remove();
    });
    delay += duration;
  }
  return { duration: delay - startDelay, cleanup: () => cleanup.forEach(dispose => dispose()) };
}
