import { isWideInitials } from '../../lib/account-identity';

/**
 * The signed-in face of the desktop column's account row: initials cut out of
 * a grey disc.
 */
export default function AccountAvatar({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-[26px] shrink-0 items-center justify-center rounded-full bg-avatar-fill font-semibold leading-none tracking-[0.01em] text-avatar-text ${
        /* One glyph set at the size two Latin letters want would sit lost in
           the disc, so a full-width script takes a step up. */
        isWideInitials(initials) ? 'text-[13px]' : 'text-[11px]'
      }`}
    >
      {initials}
    </span>
  );
}
