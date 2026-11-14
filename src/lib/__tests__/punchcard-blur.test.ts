// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPunchcardBlur } from '../punchcard-blur';

type TestPainter = (
  ctx: CanvasRenderingContext2D,
  ...args: [number, unknown[], unknown]
) => void;
type PatternPrototype = {
  punchcard?: (
    this: { onPaint: (painter: TestPainter) => unknown },
    options?: Record<string, unknown>,
  ) => unknown;
};

describe('registerPunchcardBlur', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes punchcard options through and renders the punchcard on a blurred layer', () => {
    const panel = document.createElement('div');
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 320;
    sourceCanvas.height = 180;
    panel.appendChild(sourceCanvas);

    const layerContext = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
    };
    const outputContext = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      filter: 'none',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementationOnce(() => layerContext as unknown as CanvasRenderingContext2D)
      .mockImplementationOnce(() => outputContext as unknown as CanvasRenderingContext2D);

    const painter = vi.fn() as unknown as TestPainter;
    const options = { cycles: 3 };
    const getPunchcardPainter = vi.fn(() => painter);
    let registeredPainter: TestPainter | undefined;
    const patternPrototype = {
      punchcard() {},
    } as PatternPrototype;
    registerPunchcardBlur(patternPrototype, getPunchcardPainter);
    const pattern = {
      onPaint: (nextPainter: TestPainter) => {
        registeredPainter = nextPainter;
        return 'pattern';
      },
    };

    expect(patternPrototype.punchcard).toBeDefined();
    patternPrototype.punchcard?.call(pattern, { ...options, blur: 4 });

    expect(getPunchcardPainter).toHaveBeenCalledWith(options);
    registeredPainter?.(
      { canvas: sourceCanvas } as CanvasRenderingContext2D,
      1,
      [],
      [0, 1],
    );

    expect(painter).toHaveBeenCalled();
    expect(outputContext.filter).toBe('blur(4px)');
    expect(panel.querySelector('[data-punchcard-blur-layer]')).not.toBeNull();
  });
});
