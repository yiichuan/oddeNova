import { createPortal } from 'react-dom';
import type { ControlHoverLabelAnchor } from './control-hover-anchor';

interface ControlHoverLabelProps {
  anchor: ControlHoverLabelAnchor | null;
  label: string;
  shortcutLabel?: string;
  testId?: string;
  className?: string;
}

export default function ControlHoverLabel({ anchor, label, shortcutLabel, testId, className = '' }: ControlHoverLabelProps) {
  if (!anchor || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[200] -translate-x-1/2"
      style={{ left: anchor.left, bottom: anchor.bottom }}
    >
      <div data-testid={testId} role="tooltip" className={`primary-nav-tooltip ${className}`.trim()}>
        {shortcutLabel ? (
          <span className="inline-flex items-center gap-1.5">
            <span>{label}</span>
            <kbd className="rounded-[3px] border border-border bg-surface-hover px-1 py-px font-sans text-[10px] leading-none">
              {shortcutLabel}
            </kbd>
          </span>
        ) : label}
      </div>
    </div>,
    document.body,
  );
}
