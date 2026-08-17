import { describe, expect, it, vi } from 'vitest';
import {
  CODE_EDITOR_BOTTOM_SCROLL_MARGIN,
  installCodeEditorScrollMargins,
} from '../code-editor-scroll-margins';

describe('code editor scroll margins', () => {
  it('installs a bottom safety margin matching the editor fade', () => {
    const dispatch = vi.fn();

    installCodeEditorScrollMargins({ dispatch });

    expect(CODE_EDITOR_BOTTOM_SCROLL_MARGIN).toBe(22);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0]).toHaveProperty('effects');
  });
});
