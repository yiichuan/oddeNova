import { useState } from 'react';
import {
  resetPasswordForEmail,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword,
  type AuthUser,
} from '../../services/auth-service';
import { getAuthErrorMessageKey } from '../../lib/auth-error';
import { t, zh } from '../../lib/i18n';
import type { GoogleOAuthErrorKey } from '../../lib/google-oauth-return';
import { XIcon } from '../icons';
import AuthField from './AuthField';
import CommunityInviteCard from './CommunityInviteCard';

type Mode = 'sign-in' | 'sign-up' | 'reset';

interface AccountModalProps {
  user: AuthUser | null;
  configured: boolean;
  recoveringPassword?: boolean;
  oauthErrorKey?: GoogleOAuthErrorKey | null;
  beforeSignOut?: () => Promise<void>;
  onClose: () => void;
}

export default function AccountModal({
  user,
  configured,
  recoveringPassword = false,
  oauthErrorKey = null,
  beforeSignOut,
  onClose,
}: AccountModalProps) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(() => oauthErrorKey ? t(oauthErrorKey) : '');

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

  const submit = () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    if (mode === 'sign-in') {
      if (!password) return;
      void run(async () => {
        await signInWithPassword(trimmedEmail, password);
        onClose();
      });
      return;
    }

    if (mode === 'sign-up') {
      if (!password || !passwordConfirmation) return;
      if (password !== passwordConfirmation) {
        setError(t('passwordsDoNotMatch'));
        return;
      }
      void run(async () => {
        await signUpWithPassword(trimmedEmail, password, zh ? 'zh' : 'en');
        setPassword('');
        setPasswordConfirmation('');
        setMessage(t('confirmEmailSent'));
        setMode('sign-in');
      });
      return;
    }

    void run(async () => {
      await resetPasswordForEmail(trimmedEmail, zh ? 'zh' : 'en');
      setMessage(t('passwordResetSent'));
      setMode('sign-in');
    });
  };

  const handleSignOut = () => {
    void run(async () => {
      await beforeSignOut?.();
      await signOut();
      onClose();
    });
  };

  const handleGoogleSignIn = () => {
    void run(signInWithGoogle);
  };

  const handlePasswordUpdate = () => {
    if (!password || !passwordConfirmation) return;
    if (password !== passwordConfirmation) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    void run(async () => {
      await updatePassword(password);
      onClose();
    });
  };

  const primaryLabel = mode === 'sign-up'
    ? t('createAccount')
    : mode === 'reset'
      ? t('sendResetEmail')
      : t('signIn');

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--color-overlay-backdrop)] backdrop-blur-[2px]">
      <div className="flex w-[420px] max-w-[90vw] flex-col gap-3">
        {/* Deeper at the foot than at the head: the top edge carries only the
            close button, which is mostly its own empty hit area, while the last
            row down here is a solid one that needs the room around it. */}
        <div className="bg-conversation-surface border border-border rounded-2xl px-6 pt-6 pb-10 shadow-dialog-overlay">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('account')}</h2>
              <p className="text-xs text-text-muted mt-1">{t('accountDesc')}</p>
            </div>
            {/* Nudged out of the padding box by most of the button's own slack,
                so the cross itself — not its 36px hit area — sits on the title's
                left inset and on its line's centre. */}
            <button
              onClick={onClose}
              disabled={busy}
              title={t('close')}
              aria-label={t('close')}
              className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <XIcon size={22} />
            </button>
          </div>

          {!configured ? (
            <div className="text-sm text-red-300">{t('supabaseNotConfigured')}</div>
          ) : recoveringPassword ? (
            <div className="space-y-4">
              <AuthField
                label={t('newPassword')}
                value={password}
                onChange={setPassword}
                disabled={busy}
                secret
                autoFocus
              />
              <AuthField
                label={t('confirmNewPassword')}
                value={passwordConfirmation}
                onChange={setPasswordConfirmation}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordUpdate()}
                disabled={busy}
                secret
              />

              {error && <div className="text-xs text-red-300">{error}</div>}

              {/* The action stands further off than the fields stand from each
                  other — padding rather than a margin, so the extra room survives
                  whatever the stack's own spacing turns out to be. */}
              <div className="pt-3">
                <button
                  onClick={handlePasswordUpdate}
                  disabled={busy || !password || !passwordConfirmation}
                  className="w-full py-2.5 text-sm text-on-accent bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? t('loading') : t('updatePassword')}
                </button>
              </div>
            </div>
          ) : user ? (
            <div className="space-y-5">
              <div>
                <div className="text-xs text-text-muted mb-1">{t('signedInAs')}</div>
                <div className="text-sm text-text-primary break-all">{user.email || user.id}</div>
              </div>
              {error && <div className="text-xs text-red-300">{error}</div>}
              <div className="pt-3">
                <button
                  onClick={handleSignOut}
                  disabled={busy}
                  className="w-full py-2.5 text-sm text-text-primary bg-auth-field border border-border rounded-lg hover:bg-surface-hover hover:border-accent/35 transition-colors disabled:opacity-40"
                >
                  {t('signOut')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={handleGoogleSignIn}
                disabled={busy}
                className="w-full py-2.5 px-4 text-sm font-medium text-text-primary bg-auth-field border border-border rounded-lg hover:bg-surface-hover hover:border-accent/35 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
                  <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.35l-3.24-2.55c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
                  <path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.55l3.35-2.62Z" />
                  <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
                </svg>
                {busy ? t('loading') : t('continueWithGoogle')}
              </button>

              <div className="flex items-center gap-3 py-3 text-[11px] text-text-muted">
                <span className="h-px flex-1 bg-divider" />
                <span>{t('orUseEmail')}</span>
                <span className="h-px flex-1 bg-divider" />
              </div>

              <AuthField
                label={t('email')}
                value={email}
                onChange={setEmail}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                disabled={busy}
                autoFocus
              />
              {mode !== 'reset' && (
                <AuthField
                  label={t('password')}
                  value={password}
                  onChange={setPassword}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  disabled={busy}
                  secret
                />
              )}
              {mode === 'sign-up' && (
                <AuthField
                  label={t('confirmPassword')}
                  value={passwordConfirmation}
                  onChange={setPasswordConfirmation}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  disabled={busy}
                  secret
                />
              )}

              {message && <div className="text-xs text-form-ok-text">{message}</div>}
              {error && <div className="text-xs text-red-300">{error}</div>}

              {/* The submit button and the two links under it travel together —
                  the padding goes above the pair, so the gap that opens is
                  between the form and everything you do with it. */}
              <div className="pt-7">
                <button
                  onClick={submit}
                  disabled={busy || !email.trim() || (mode !== 'reset' && !password) || (mode === 'sign-up' && !passwordConfirmation)}
                  className="w-full py-2.5 text-sm text-on-accent bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? t('loading') : primaryLabel}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  disabled={busy}
                  onClick={() => { setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'); setError(''); setMessage(''); }}
                  className="text-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {mode === 'sign-up' ? t('haveAccount') : t('needAccount')}
                </button>
                <button
                  disabled={busy}
                  onClick={() => { setMode(mode === 'reset' ? 'sign-in' : 'reset'); setError(''); setMessage(''); }}
                  className="text-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {mode === 'reset' ? t('backToSignIn') : t('forgotPassword')}
                </button>
              </div>
            </div>
          )}
        </div>

        <CommunityInviteCard />
      </div>
    </div>
  );
}
