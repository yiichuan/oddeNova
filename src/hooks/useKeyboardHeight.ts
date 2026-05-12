import { useEffect, useState } from 'react';

/**
 * 监听软键盘弹出高度（px）。
 * 使用 visualViewport API，iOS Safari / Android Chrome 均兼容。
 * 键盘收起时返回 0。
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // 键盘高度 = 窗口总高 - 可视视口高 - 视口顶部偏移
      const kh = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardHeight(Math.round(kh));
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return keyboardHeight;
}
