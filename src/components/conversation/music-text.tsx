import type { Element, ElementContent, Root } from 'hast';
import { BUILTIN_SYNTHS, DRUM_MACHINE_ALIAS_MAP, MELODIC_SAMPLES, SAMPLE_ALLOWLIST } from '../../lib/sample-allowlist';

const musicTokenClass = 'rounded-[2px] bg-brand-accent/20 px-1 box-decoration-clone';

const knownDrumNames = new Set(['bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'sn']);
const pitch = String.raw`[A-Ga-g](?:[#b♯♭]{1,2})?(?:-1|\d)`;
const root = '[A-G](?:[#b♯♭]{1,2})?';
const chordQuality = '(?:maj(?:6|7|9|11|13)?|(?:min|m|dim|aug)(?:6|7|9|11|13)?|sus[24]?|add(?:2|4|6|9|11|13)|6|7|9|11|13)';
const chord = `${root}${chordQuality}?(?:/${root})?`;
const namedChord = `${root}(?:${chordQuality}(?:/${root})?|/${root})`;
const trModels = Object.values(DRUM_MACHINE_ALIAS_MAP)
  .filter(alias => /^TR\d{3}$/.test(alias))
  .map(alias => alias.replace('TR', 'TR[-‐‑]?'))
  .join('|');
const tokenPattern = new RegExp(String.raw`(?<!\w)(?:(?<drumMachine>${trModels})|(?<sequence>${chord}(?:[ \t]*[–—→-][ \t]*${chord})+)|(?<pitch>${pitch})|(?<chord>${namedChord})|[A-Za-z0-9_]+(?::\d+)?)(?!\w)`, 'g');
const sampleLabelPattern = /^[ \t]*(?:（[^（）\r\n]{1,40}）|\([^()\r\n]{1,40}\))/;

type TextPiece = { text: string; kind?: 'sample' | 'pitch' | 'harmony' };

function musicTextPieces(text: string, context: 'prose' | 'code' | 'sample-label' = 'prose'): TextPiece[] {
  const inlineCode = context === 'code';
  const pieces: TextPiece[] = [];
  let cursor = 0;
  for (const match of text.matchAll(tokenPattern)) {
    const [word] = match;
    const start = match.index;
    if (start < cursor) continue;
    const end = start + word.length;
    const isPitch = match.groups?.pitch && (inlineCode || /^[A-G]/.test(word));
    const isHarmony = match.groups?.sequence || match.groups?.chord;
    if (!isPitch && !isHarmony && !match.groups?.drumMachine) {
      const name = word.replace(/:\d+$/, '');
      if (!SAMPLE_ALLOWLIST.has(name) && !BUILTIN_SYNTHS.has(name)) continue;
      const label = text.slice(end).match(sampleLabelPattern)?.[0];
      // The catalog includes ordinary words such as "if" and "world".
      // Require musical context for identifiers that look like prose.
      const quoted = start > 0 && /["'“‘]/.test(text[start - 1]) && /["'”’]/.test(text[end] ?? '');
      const musicalName = knownDrumNames.has(name) || MELODIC_SAMPLES.includes(name) || BUILTIN_SYNTHS.has(name);
      const sampleLabel = context === 'sample-label' && !text.slice(end).trim()
        && (start === 0 || /·[ \t]*$/.test(text.slice(0, start)));
      if (!inlineCode && !quoted && !label && !/[_\d:]/.test(word) && !musicalName && !sampleLabel) continue;
    }
    if (start > cursor) pieces.push({ text: text.slice(cursor, start) });
    pieces.push({ text: text.slice(start, end), kind: isPitch ? 'pitch' : isHarmony ? 'harmony' : 'sample' });
    cursor = end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) });
  return pieces;
}

export function MusicText({ text, sampleLabel = false }: { text: string; sampleLabel?: boolean }) {
  return musicTextPieces(text, sampleLabel ? 'sample-label' : 'prose').map(({ text: value, kind }, index) => kind
    ? <span key={index} data-music-token={kind} className={musicTokenClass}>{value}</span>
    : value);
}

// Work on parsed Markdown so a match cannot change Markdown syntax or touch
// fenced code, while inline code, tables and emphasis retain their structure.
// eslint-disable-next-line react-refresh/only-export-components -- shared token rendering for Markdown and plain text
export function rehypeMusicText() {
  return (tree: Root) => {
    const visit = (parent: Root | Element) => {
      for (let index = parent.children.length - 1; index >= 0; index--) {
        const child = parent.children[index];
        if (child.type === 'element' && child.tagName !== 'pre') visit(child);
        if (child.type !== 'text') continue;
        const pieces = musicTextPieces(child.value, parent.type === 'element' && parent.tagName === 'code' ? 'code' : 'prose');
        if (!pieces.some(piece => piece.kind)) continue;
        const nodes = pieces.map(({ text, kind }): ElementContent => kind ? {
          type: 'element', tagName: 'span', properties: { className: musicTokenClass.split(' '), 'data-music-token': kind },
          children: [{ type: 'text', value: text }],
        } : { type: 'text', value: text });
        parent.children.splice(index, 1, ...nodes);
      }
    };
    visit(tree);
  };
}
