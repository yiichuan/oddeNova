import { useState, type KeyboardEvent } from 'react';
import { t } from '../../lib/i18n';

/**
 * One field of an account form, standing two lines tall: what it is on top, what
 * you typed underneath. The label lives inside the box rather than above it, so
 * a stack of these reads as a stack of boxes rather than as alternating text and
 * boxes — and the whole box is the label, so clicking anywhere in it starts
 * typing.
 */
interface AuthFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled: boolean;
  autoFocus?: boolean;
  /** Masks the value and offers the reveal toggle. */
  secret?: boolean;
  /** Ignored when `secret` — a masked field is always a password field. */
  type?: 'email' | 'text';
}

export default function AuthField({
  label,
  value,
  onChange,
  onKeyDown,
  disabled,
  autoFocus,
  secret = false,
  type = 'email',
}: AuthFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <label className="relative block rounded-lg border border-[#2E2E2E] bg-auth-field px-3 py-2 transition-colors focus-within:border-[#525252]">
      <span className="block text-[11px] leading-4 text-text-muted">{label}</span>
      <input
        type={secret ? (show ? 'text' : 'password') : type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        /* Transparent, so the box's fill runs unbroken behind it — except when
           Chrome autofills, which `.auth-field` in index.css paints back over.
           16px and no smaller: iOS zooms the page on focus below that. */
        className={`auth-field w-full border-0 bg-transparent p-0 text-base leading-6 text-text-primary outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
          secret ? 'pr-8' : ''
        }`}
      />
      {secret && (
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          disabled={disabled}
          tabIndex={-1}
          aria-label={show ? t('hidePassword') : t('showPassword')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {show ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      )}
    </label>
  );
}
