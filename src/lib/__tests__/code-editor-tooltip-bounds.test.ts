import { describe, expect, it, vi } from 'vitest';
import {
  codeEditorTooltipSpace,
  installCodeEditorTooltipBounds,
} from '../code-editor-tooltip-bounds';

describe('code editor tooltip bounds', () => {
  it('confines popups to the editor rather than the window', () => {
    // The control bar sits below 520 — anything CodeMirror is allowed to fill
    // past that point is a popup painting under it.
    const view = {
      dom: {
        getBoundingClientRect: () => ({ top: 80, bottom: 520, left: 400, right: 1200 }),
      },
    };

    expect(codeEditorTooltipSpace(view)).toEqual({
      top: 80,
      bottom: 520,
      left: 400,
      right: 1200,
    });
  });

  it('installs the bounds on an existing editor', () => {
    const dispatch = vi.fn();

    installCodeEditorTooltipBounds({ dispatch });

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0]).toHaveProperty('effects');
  });
});
