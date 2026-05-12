import { useEffect, useRef, useState } from 'react';

/**
 * 监听软键盘弹出高度（px）。
 * 使用 visualViewport API，iOS Safari / Android Chrome 均兼容。
 * 键盘收起时返回 0。
 *
 * 使用 debounce 避免 iOS 键盘动画过程中中间帧导致高度值临时偏大后回落的跳动问题。
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // 键盘高度 = 窗口总高 - 可视视口高（不减 offsetTop，避免页面滚动时计算偏差）
        const height = Math.max(0, window.innerHeight - vv.height);
        setKeyboardHeight(Math.round(height));
      }, 100);
    };

    // iOS Safari 键盘弹出时有时触发 scroll 而非 resize，两者均监听以保证跨平台覆盖
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return keyboardHeight;
}
