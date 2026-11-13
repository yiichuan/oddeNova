type PaintArgs = [time: number, haps: unknown[], drawTime: unknown];
type PunchcardPainter = ((ctx: CanvasRenderingContext2D, ...args: PaintArgs) => void) & {
  __oddenovaIsolatedPunchcard?: boolean;
};
export const PUNCHCARD_BLUR_LAYER_ATTRIBUTE = 'data-punchcard-blur-layer';

export function clearPunchcardBlurLayers(panel: ParentNode): void {
  panel.querySelectorAll<HTMLCanvasElement>(`[${PUNCHCARD_BLUR_LAYER_ATTRIBUTE}]`).forEach((layer) => {
    layer.getContext('2d')?.clearRect(0, 0, layer.width, layer.height);
  });
}

type PunchcardPrototype = {
  punchcard?: (this: { onPaint: (painter: PunchcardPainter) => unknown }, options?: Record<string, unknown>) => unknown;
  __oddenovaBlurredPunchcard?: boolean;
  [key: string]: unknown;
};

function withPunchcardLayer(painter: PunchcardPainter, blur: number): PunchcardPainter {
  let layer: HTMLCanvasElement | undefined;
  let layerContext: CanvasRenderingContext2D | null = null;
  let outputLayer: HTMLCanvasElement | undefined;
  let outputContext: CanvasRenderingContext2D | null = null;

  const layeredPainter: PunchcardPainter = (ctx, ...args) => {
    if (!layer) {
      layer = document.createElement('canvas');
      layerContext = layer.getContext('2d');
    }
    if (!layerContext) return;

    if (layer.width !== ctx.canvas.width || layer.height !== ctx.canvas.height) {
      layer.width = ctx.canvas.width;
      layer.height = ctx.canvas.height;
    }

    layerContext.clearRect(0, 0, layer.width, layer.height);
    layerContext.save();
    painter(layerContext, ...args);
    layerContext.restore();

    // Keep the blurred image on its own cleared canvas. Drawing into the shared
    // panel canvas would accumulate translucent pixels from earlier frames.
    if (!outputLayer) {
      outputLayer = document.createElement('canvas');
      outputLayer.setAttribute(PUNCHCARD_BLUR_LAYER_ATTRIBUTE, '');
      outputLayer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
      ctx.canvas.parentElement?.appendChild(outputLayer);
      outputContext = outputLayer.getContext('2d');
    }
    if (!outputContext) return;

    if (outputLayer.width !== ctx.canvas.width || outputLayer.height !== ctx.canvas.height) {
      outputLayer.width = ctx.canvas.width;
      outputLayer.height = ctx.canvas.height;
    }

    outputContext.clearRect(0, 0, outputLayer.width, outputLayer.height);
    outputContext.save();
    outputContext.filter = blur > 0 ? `blur(${blur * (window.devicePixelRatio || 1)}px)` : 'none';
    outputContext.drawImage(layer, 0, 0);
    outputContext.restore();
  };
  layeredPainter.__oddenovaIsolatedPunchcard = true;
  return layeredPainter;
}

/** Add a local `blur` option to Strudel's existing `.punchcard()` method. */
export function registerPunchcardBlur(
  patternPrototype: object,
  getPunchcardPainter: (options: Record<string, unknown>) => PunchcardPainter,
): void {
  const prototype = patternPrototype as PunchcardPrototype;
  if (prototype.__oddenovaBlurredPunchcard || !prototype.punchcard) return;

  prototype.punchcard = function (
    this: { onPaint: (painter: PunchcardPainter) => unknown },
    options: Record<string, unknown> = {},
  ) {
    const { blur, ...punchcardOptions } = options;
    const blurRadius = typeof blur === 'number' && Number.isFinite(blur) ? Math.max(0, blur) : 0;
    return this.onPaint(withPunchcardLayer(getPunchcardPainter(punchcardOptions), blurRadius));
  };
  prototype.__oddenovaBlurredPunchcard = true;
}
