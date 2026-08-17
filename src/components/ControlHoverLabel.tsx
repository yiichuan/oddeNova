import { createPortal } from 'react-dom';

export interface ControlHoverLabelAnchor {
  left: number;
  bottom: number;
}

interface ControlHoverLabelProps {
  anchor: ControlHoverLabelAnchor | null;
  label: string;
  testId?: string;
  className?: string;
}

export default function ControlHoverLabel({ anchor, label, testId, className = '' }: ControlHoverLabelProps) {
  if (!anchor || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[200] -translate-x-1/2"
      style={{ left: anchor.left, bottom: anchor.bottom }}
    >
      <div data-testid={testId} role="tooltip" className={`primary-nav-tooltip ${className}`.trim()}>
        {label}
      </div>
    </div>,
    document.body,
  );
}
