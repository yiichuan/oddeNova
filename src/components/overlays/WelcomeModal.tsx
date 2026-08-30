import { useState, type KeyboardEvent } from 'react';
import {
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from '../../services/auth-service';
import { getAuthErrorMessageKey } from '../../lib/auth-error';
import { t, zh } from '../../lib/i18n';
import { XIcon } from '../icons';
import AuthField from './AuthField';
import { getCommunityInviteText } from './apiKeyModalUtils';
import qrCode from '../../assets/oddeNova音乐制作社区二维码.png';

/**
 * The three faces of the first-entry window, in the order someone meets them:
 * the invitation (Google, or an email address), the account it turns into once
 * they commit to email, and the way back for someone who already has one.
 */
type Step = 'invite' | 'sign-up' | 'sign-in';

const PRIMARY_BUTTON_CLASS =
  'w-full py-2.5 text-sm text-white bg-[#4D4D4D] rounded-lg hover:bg-[#5C5C5C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

interface WelcomeModalProps {
  configured: boolean;
  onClose: () => void;
}

export default function WelcomeModal({ configured, onClose }: WelcomeModalProps) {
  const [step, setStep] = useState<Step>('invite');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (err) {
      setError(t(getAuthErrorMessageKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const trimmedEmail = email.trim();
  const needsPassword = step !== 'invite';
  const canSubmit = !busy && !!trimmedEmail && (!needsPassword || !!password);

  const submit = () => {
    if (!canSubmit) return;

    // The first press is not a submission at all: it is the moment the window
    // turns from an invitation into an account, and the password field it
    // reveals is what the next press acts on.
    if (step === 'invite') {
      setError('');
      setMessage('');
      setStep('sign-up');
      return;
    }

    if (step === 'sign-up') {
      void run(async () => {
        await signUpWithPassword(trimmedEmail, password, zh ? 'zh' : 'en');
        setPassword('');
        setMessage(t('confirmEmailSent'));
        setStep('sign-in');
      });
      return;
    }

    void run(async () => {
      await signInWithPassword(trimmedEmail, password);
      onClose();
    });
  };

  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  const communityInvite = getCommunityInviteText();

  const primaryLabel = step === 'invite'
    ? t('welcomeContinueWithEmail')
    : step === 'sign-up'
      ? t('welcomeCreateAccount')
      : t('signIn');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="flex w-[420px] max-w-[90vw] flex-col gap-3">
        {/* Deeper at the foot than at the head: the top edge carries only the
            close button, which is mostly its own empty hit area, while the last
            row down here is a solid one that needs the room around it. */}
        <div className="bg-conversation-surface border border-border rounded-2xl px-6 pt-6 pb-10 shadow-2xl">
          {/* The cross keeps the corner to itself and the title takes the width
              below it, so the title's centre is the window's centre rather than
              the centre of whatever is left over beside the button. */}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              disabled={busy}
              title={t('close')}
              aria-label={t('close')}
              className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <XIcon size={22} />
            </button>
          </div>
          <h2 className="mb-6 text-center text-xl font-semibold text-text-primary">
            {t('welcomeTitle')}
          </h2>

          {!configured ? (
            <div className="text-sm text-red-300">{t('supabaseNotConfigured')}</div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => void run(signInWithGoogle)}
                disabled={busy}
                className="w-full py-2.5 px-4 text-sm font-medium text-text-primary bg-white/[0.05] border border-[#2E2E2E] rounded-lg hover:bg-white/[0.09] hover:border-[#4A4A4A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
                  <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.35l-3.24-2.55c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
                  <path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.55l3.35-2.62Z" />
                  <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
                </svg>
                {busy ? t('loading') : t('continueWithGoogle')}
              </button>

              {/* `py-3` rather than a bigger gap on the stack: the extra room
                  belongs around this one row, not between every pair. */}
              <div className="flex items-center gap-3 py-3 text-[11px] text-text-muted">
                <span className="h-px flex-1 bg-[#2E2E2E]" />
                <span>{t('welcomeOr')}</span>
                <span className="h-px flex-1 bg-[#2E2E2E]" />
              </div>

              <AuthField
                label={t('email')}
                value={email}
                onChange={setEmail}
                onKeyDown={submitOnEnter}
                disabled={busy}
                autoFocus
              />

              {needsPassword && (
                <AuthField
                  label={t('password')}
                  value={password}
                  onChange={setPassword}
                  onKeyDown={submitOnEnter}
                  disabled={busy}
                  secret
                  autoFocus
                />
              )}

              {message && <div className="text-xs text-green-300">{message}</div>}
              {error && <div className="text-xs text-red-300">{error}</div>}

              {/* The action stands further off than the fields stand from each
                  other — padding rather than a margin, so the extra room survives
                  whatever the stack's own spacing turns out to be. */}
              <div className="pt-3">
                <button onClick={submit} disabled={!canSubmit} className={PRIMARY_BUTTON_CLASS}>
                  {busy ? t('loading') : primaryLabel}
                </button>
              </div>

              {/* Each of the two accounts steps points at the other, so neither
                  is somewhere you can only arrive at. The invitation has no such
                  line: it is not yet either one. */}
              {needsPassword && (
                <p className="text-xs text-text-muted text-center">
                  {step === 'sign-up' ? t('welcomeHaveAccount') : t('welcomeNoAccount')}
                  {' '}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError('');
                      setMessage('');
                      setStep(step === 'sign-up' ? 'sign-in' : 'sign-up');
                    }}
                    className="text-text-secondary underline underline-offset-2 hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {step === 'sign-up' ? t('signIn') : t('welcomeSignUpLink')}
                  </button>
                </p>
              )}
            </div>
          )}
        </div>

        {/* A window of its own rather than a strip inside the one above: the
            invitation is not part of making an account, and standing it apart is
            what says so. */}
        {/* Centred as a pair rather than pinned left: the line is far shorter
            than the window is wide, and left-aligning it leaves all the slack
            stacked up on one side. */}
        <div className="flex items-center justify-center gap-4 rounded-2xl border border-border bg-conversation-surface px-6 py-4 shadow-2xl">
          {/* The source is black on white and the white is baked into the
              pixels, so the way to grey it is to scale the whole tile down:
              `brightness` leaves black where it is and takes white to #B8B8B8.
              The code keeps its polarity, so it still scans. */}
          <img
            src={qrCode}
            alt={communityInvite.alt}
            className="size-16 shrink-0 rounded-lg bg-white p-1 object-contain brightness-[0.72]"
          />
          {/* Centred in what the code leaves rather than pushed up against it,
              so the slack sits on both sides of the line instead of all of it
              on the right. */}
          <p className="flex-1 text-center text-sm font-medium text-text-secondary">
            {communityInvite.title}
          </p>
        </div>
      </div>
    </div>
  );
}
