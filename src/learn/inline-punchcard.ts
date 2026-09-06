interface InlinePunchcardOptions {
  width?: number;
  height?: number;
  pixelRatio?: number;
  [key: string]: unknown;
}

interface InlinePunchcardPattern {
  tag: (id: string) => InlinePunchcardPattern;
  punchcard: (options: InlinePunchcardOptions) => InlinePunchcardPattern;
}

type PatternConstructor = {
  prototype: InlinePunchcardPattern & {
    _punchcard?: (id: string, options?: InlinePunchcardOptions) => InlinePunchcardPattern;
  };
};

type SetWidget = (id: string, element: HTMLCanvasElement) => void;

/**
 * Backports Strudel's current inline punchcard implementation while the
 * published @strudel/codemirror package still starts a standalone draw loop.
 *
 * Attaching the punchcard painter to the pattern is what lets transformations
 * later in the chain (for example `.color("cyan")`) reach the visualization.
 */
export function installInlinePunchcardWidget(Pattern: PatternConstructor, setWidget: SetWidget): void {
  Pattern.prototype._punchcard = function (id, options = {}) {
    const {
      width = 500,
      height = 60,
      pixelRatio = window.devicePixelRatio,
    } = options;
    const existing = document.getElementById(id);
    const canvas = existing instanceof HTMLCanvasElement
      ? existing
      : document.createElement('canvas');

    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    setWidget(id, canvas);

    return this.tag(id).punchcard({
      fold: 1,
      ...options,
      ctx: canvas.getContext('2d'),
      id,
    });
  };
}
