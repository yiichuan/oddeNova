// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installInlinePunchcardWidget } from '../inline-punchcard';

interface TestValue {
  note: string;
  color: string;
}

class TestPattern {
  declare _punchcard: (id: string, options?: Record<string, unknown>) => TestPattern;
  readonly value: TestValue;
  readonly painters: Record<string, unknown>[];

  constructor(value: TestValue, painters: Record<string, unknown>[] = []) {
    this.value = value;
    this.painters = painters;
  }

  tag(_id: string): TestPattern {
    return this;
  }

  punchcard(options: Record<string, unknown>): TestPattern {
    return new TestPattern(this.value, [...this.painters, options]);
  }

  draw(): TestPattern {
    return this;
  }

  color(color: string): TestPattern {
    return new TestPattern({ ...this.value, color }, this.painters);
  }

  getPainters(): Record<string, unknown>[] {
    return this.painters;
  }

  queryArc(_begin?: number, _end?: number): Array<{ value: TestValue }> {
    return [{ value: this.value }];
  }
}

const setWidget = vi.fn((id: string, element: HTMLCanvasElement) => {
  element.id = id;
  document.body.appendChild(element);
});

describe('installInlinePunchcardWidget', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    setWidget.mockClear();
    installInlinePunchcardWidget(TestPattern, setWidget);
  });

  it('keeps the punchcard painter on the final pattern so later colors are visible', () => {
    const pattern = new TestPattern({ note: 'c', color: 'white' });

    const finalPattern = pattern
      ._punchcard('learn_widget__punchcard_0', { pixelRatio: 1 })
      .color('cyan');

    expect(finalPattern.getPainters()).toHaveLength(1);
    expect(finalPattern.queryArc(0, 1)[0].value.color).toBe('cyan');
  });
});
