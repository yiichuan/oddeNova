import { useRef, useState, type KeyboardEvent } from 'react';
import { t } from '../../lib/i18n';
import { useIsMobile } from '../../hooks/useIsMobile';

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
  const isMobile = useIsMobile();
  const composing = useRef(false);

  return (
    /* The box is held at the height of the two lines it carries — the label and
       the one line of value — rather than sized by them, and clips what it
       holds. Between this and `.auth-field` in index.css, nothing the keyboard
       puts inside the field while typing (a composing run, an inline
       candidate) can add a line to it or move the row below. */
    <label className="relative block h-[3.625rem] overflow-hidden rounded-lg border border-border bg-auth-field px-3 py-2 transition-colors focus-within:border-accent">
      <span className="block text-[11px] leading-4 text-text-muted">{label}</span>
      <input
        // Use a plain single-line editing host for mobile IME input, while
        // keeping the email keyboard and autofill hints below.
        type={secret ? (show ? 'text' : 'password') : isMobile ? 'text' : type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => {
          if (isMobile && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) return;
          if (isMobile && event.key === 'Enter') event.preventDefault();
          onKeyDown?.(event);
        }}
        autoFocus={autoFocus}
        /* An address is not prose. A phone keyboard that treats it as prose
           capitalises the first letter, autocorrects the domain and offers
           predictions — and it is the predictions that showed: clearing the
           field and typing into it again re-armed the suggestion strip, whose
           inline candidate the field then had to find room for. Turning the
           whole language layer off is what keeps this a single unbroken line.
           `inputMode` gets the address keyboard (@ and . on the first plane)
           for the same reason the type does. */
        autoComplete={!secret && type === 'email' ? 'email' : undefined}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode={!secret && type === 'email' ? 'email' : undefined}
        /* Transparent, so the box's fill runs unbroken behind it — except when
           Chrome autofills, which `.auth-field` in index.css paints back over.
           16px and no smaller: iOS zooms the page on focus below that.
           `h-6` pins the box to that one line, and `.auth-field` in index.css
           states the rest of the single-line geometry — one line-height, no
           wrapping, overflow scrolled to rather than broken — because left to
           size itself the field grows the moment anything (a predicted
           candidate, a composing run) asks for a second line, and the whole
           form steps down with it. */
        className={`auth-field h-6 w-full border-0 bg-transparent p-0 text-base leading-6 text-text-primary outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
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
