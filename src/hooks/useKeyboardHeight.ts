import { useEffect, useState } from 'react';

/**
 * 监听软键盘弹出高度（px）。
 * 使用 visualViewport API，iOS Safari / Android Chrome 均兼容。
 * 键盘收起时返回 0。
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(() => 0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // 键盘高度 = 窗口总高 - 可视视口高 - 视口顶部偏移
      const height = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardHeight(Math.round(height));
    };

    // iOS Safari 键盘弹出时有时触发 scroll 而非 resize，两者均监听以保证跨平台覆盖
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return keyboardHeight;
}
