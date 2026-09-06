import { useId } from 'react';
import { ASCII_GALAXY_FRAME } from './ascii-galaxy-frame';
import { useResolvedTheme } from '../../hooks/useAppearance';
import type {
  AnimationPreference,
  ResolvedTheme,
  ThemePreference,
} from '../../lib/appearance-preferences';

/* Previews for the appearance settings. The theme preview is a wireframe: the
   four regions of the real workspace — nav column, conversation sidebar, code
   panel, visual pane — blocked out from deterministic geometry, so it renders
   the same every time. The animation previews are still frames captured from
   the animations themselves. */

const VIEW_WIDTH = 168;
const VIEW_HEIGHT = 104;

interface Palette {
  page: string;
  surface: string;
  stroke: string;
}

const PALETTES: Record<ResolvedTheme, Palette> = {
  dark: {
    page: '#050505',
    surface: '#101010',
    stroke: '#2B2B2B',
  },
  light: {
    page: '#E4E4EB',
    surface: '#F7F7FA',
    stroke: '#D5D5DE',
  },
};

/* Region boxes, in view units. 6px page padding, 4px gutters. */
const NAV = { x: 6, y: 6, width: 11, height: 92 };
const SIDEBAR = { x: 21, y: 6, width: 47, height: 92 };
const CODE = { x: 72, y: 6, width: 90, height: 60 };
const VIZ = { x: 72, y: 70, width: 90, height: 28 };
const REGIONS = [NAV, SIDEBAR, CODE, VIZ];

/** The conversation column is split in two: message flow above, composer below. */
const SIDEBAR_SPLIT_Y = SIDEBAR.y + SIDEBAR.height - 20;

function Wireframe({ palette }: { palette: Palette }) {
  return (
    <g>
      <rect x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={palette.page} />
      {REGIONS.map((region, index) => (
        <rect
          key={index}
          {...region}
          rx="3"
          fill={palette.surface}
          stroke={palette.stroke}
          strokeWidth="0.75"
        />
      ))}
      <line
        x1={SIDEBAR.x}
        y1={SIDEBAR_SPLIT_Y}
        x2={SIDEBAR.x + SIDEBAR.width}
        y2={SIDEBAR_SPLIT_Y}
        stroke={palette.stroke}
        strokeWidth="0.75"
      />
    </g>
  );
}

/**
 * Workspace wireframe in the palette a theme choice paints with. "Match system"
 * is drawn as both palettes split along a diagonal.
 */
export function ThemePreview({ preference }: { preference: ThemePreference }) {
  const clipId = `${useId()}-split`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      className="block h-full w-full"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      {preference === 'system' ? (
        <>
          <clipPath id={clipId}>
            <polygon points={`${VIEW_WIDTH},0 ${VIEW_WIDTH},${VIEW_HEIGHT} 56,${VIEW_HEIGHT} 112,0`} />
          </clipPath>
          <Wireframe palette={PALETTES.light} />
          <g clipPath={`url(#${clipId})`}>
            <Wireframe palette={PALETTES.dark} />
          </g>
        </>
      ) : (
        <Wireframe palette={PALETTES[preference]} />
      )}
    </svg>
  );
}

// ── Animation previews ───────────────────────────────────────────────────────

/**
 * The visual pane as each animation actually paints it. Both thumbnails are a
 * still frame of the real animation, captured from the animation's own code and
 * shrunk from a full pane — see `npm run previews:animation`. Nothing here
 * animates or loads a frame, so the panel costs no rAF loop and no network.
 */
export function AnimationPreview({ animation }: { animation: AnimationPreference }) {
  return animation === 'galaxy' ? (
    <img
      src="/animation/previews/galaxy.png"
      alt=""
      className="block h-full w-full object-cover"
      loading="lazy"
      decoding="async"
    />
  ) : (
    <AsciiGalaxyFrame />
  );
}

const FRAME = ASCII_GALAXY_FRAME;

/**
 * The captured glyph grid, drawn as one `<text>` per run of cells sharing an
 * opacity. `textLength` pins each run to the grid the capture measured, so the
 * layout survives whichever monospace face the browser resolves.
 */
function AsciiGalaxyFrame() {
  /* The resolved palette, not the preference: the thumbnail is a picture of
     what the pane will paint, and under "match system" that is whichever half
     the OS is currently on. The galaxy itself is the same drawing either way,
     so only these two values change. */
  const palette = FRAME.palettes[useResolvedTheme()];

  return (
    <svg
      viewBox={`0 0 ${FRAME.columns * FRAME.cellWidth} ${FRAME.rows * FRAME.cellHeight}`}
      className="block h-full w-full"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect
        x="0"
        y="0"
        width={FRAME.columns * FRAME.cellWidth}
        height={FRAME.rows * FRAME.cellHeight}
        fill={palette.background}
      />
      <g
        fill={palette.color}
        fontFamily='"SFMono-Regular", "Cascadia Mono", "Noto Sans Mono", monospace'
        fontSize={FRAME.fontSize}
        fontWeight="600"
      >
        {ASCII_RUNS.map(({ column, row, text, opacity }) => (
          <text
            key={`${row}-${column}`}
            x={column * FRAME.cellWidth}
            // The capture drew from the top of the cell; SVG measures from the
            // baseline, which sits about four fifths of the way down.
            y={row * FRAME.cellHeight + FRAME.fontSize * 0.8}
            textLength={text.length * FRAME.cellWidth}
            lengthAdjust="spacingAndGlyphs"
            fillOpacity={opacity}
          >
            {text}
          </text>
        ))}
      </g>
    </svg>
  );
}

interface AsciiRun {
  column: number;
  row: number;
  text: string;
  opacity: number;
}

/** Adjacent cells at one opacity collapse into a single run. */
const ASCII_RUNS: AsciiRun[] = FRAME.glyphRows.flatMap((glyphRow, row) => {
  const opacityRow = FRAME.opacityRows[row];
  const runs: AsciiRun[] = [];
  let run: AsciiRun | null = null;
  let level = '0';

  for (let column = 0; column < glyphRow.length; column += 1) {
    const cell = opacityRow[column];
    if (cell === '0') {
      run = null;
      continue;
    }
    if (!run || cell !== level) {
      run = { column, row, text: '', opacity: FRAME.opacities[parseInt(cell, 36) - 1] };
      runs.push(run);
      level = cell;
    }
    run.text += glyphRow[column];
  }

  return runs;
});
