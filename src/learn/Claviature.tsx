// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — claviature is a plain JS ESM package with no type declarations
import { getClaviature } from 'claviature';

interface ClaviatureOptions {
  range: [string, string];
  scaleX?: number;
  scaleY?: number;
  /** Keys accept either a MIDI number or a note name — the package normalizes both. */
  colorize?: { keys: (string | number)[]; color: string }[];
  labels?: Record<string, string | number>;
}

interface ClaviatureProps {
  options: ClaviatureOptions;
  /** Called with the MIDI number of the pressed key. */
  onMouseDown?: (midi: number) => void;
}

interface ClaviatureSvgChild {
  name: string;
  attributes: Record<string, unknown>;
  value?: string;
}

/** Renders a piano-keyboard SVG, matching strudel.cc's own `<Claviature>` component (same `claviature` npm package). */
export default function Claviature({ options, onMouseDown }: ClaviatureProps) {
  const svg = getClaviature({ options, onMouseDown });
  return (
    <svg {...svg.attributes}>
      {svg.children.map((el: ClaviatureSvgChild, i: number) => {
        const TagName = el.name as keyof React.JSX.IntrinsicElements;
        const { key: _key, ...attributes } = el.attributes;
        return (
          <TagName key={`${el.name}-${i}`} {...attributes}>
            {el.value}
          </TagName>
        );
      })}
    </svg>
  );
}
