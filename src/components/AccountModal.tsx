import { useState, type KeyboardEvent } from 'react';
import {
  resetPasswordForEmail,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword,
  type AuthUser,
} from '../services/auth-service';
import { getAuthErrorMessageKey } from '../lib/auth-error';
import { t, zh } from '../lib/i18n';
import type { GoogleOAuthErrorKey } from '../lib/google-oauth-return';

type Mode = 'sign-in' | 'sign-up' | 'reset';

function PasswordField({
  label,
  value,
  onChange,
  onKeyDown,
  disabled,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled: boolean;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="text-xs text-text-secondary mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 pr-9 outline-none border border-border focus:border-accent/50"
          autoFocus={autoFocus}
        />
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
      </div>
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="bg-bg-secondary border border-border rounded-2xl p-6 w-[420px] max-w-[90vw] shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('account')}</h2>
            <p className="text-xs text-text-muted mt-1">{t('accountDesc')}</p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-text-muted hover:text-text-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('close')}
          </button>
        </div>

        {!configured ? (
          <div className="text-sm text-red-300">{t('supabaseNotConfigured')}</div>
        ) : recoveringPassword ? (
          <div className="space-y-4">
            <PasswordField
              label={t('newPassword')}
              value={password}
              onChange={setPassword}
              disabled={busy}
              placeholder={t('newPasswordPlaceholder')}
              autoFocus
            />
            <PasswordField
              label={t('confirmNewPassword')}
              value={passwordConfirmation}
              onChange={setPasswordConfirmation}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordUpdate()}
              disabled={busy}
              placeholder={t('confirmNewPasswordPlaceholder')}
            />

            {error && <div className="text-xs text-red-300">{error}</div>}

            <button
              onClick={handlePasswordUpdate}
              disabled={busy || !password || !passwordConfirmation}
              className="w-full py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? t('loading') : t('updatePassword')}
            </button>
          </div>
        ) : user ? (
          <div className="space-y-5">
            <div>
              <div className="text-xs text-text-muted mb-1">{t('signedInAs')}</div>
              <div className="text-sm text-text-primary break-all">{user.email || user.id}</div>
            </div>
            {error && <div className="text-xs text-red-300">{error}</div>}
            <button
              onClick={handleSignOut}
              disabled={busy}
              className="w-full py-2.5 text-sm text-white bg-bg-tertiary border border-border rounded-lg hover:border-accent/50 transition-colors disabled:opacity-40"
            >
              {t('signOut')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleGoogleSignIn}
              disabled={busy}
              className="w-full py-2.5 px-4 text-sm font-medium text-text-primary bg-white/5 border border-border rounded-lg hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
                <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z" />
                <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.35l-3.24-2.55c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
                <path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.55l3.35-2.62Z" />
                <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
              </svg>
              {busy ? t('loading') : t('continueWithGoogle')}
            </button>

            <div className="flex items-center gap-3 text-[11px] text-text-muted">
              <span className="h-px flex-1 bg-border" />
              <span>{t('orUseEmail')}</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">{t('email')}</label>
              <input
                type="email"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder={t('emailPlaceholder')}
                className="w-full bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
                autoFocus
              />
            </div>
            {mode !== 'reset' && (
              <PasswordField
                label={t('password')}
                value={password}
                onChange={setPassword}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                disabled={busy}
                placeholder={t('passwordPlaceholder')}
              />
            )}
            {mode === 'sign-up' && (
              <PasswordField
                label={t('confirmPassword')}
                value={passwordConfirmation}
                onChange={setPasswordConfirmation}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                disabled={busy}
                placeholder={t('confirmPasswordPlaceholder')}
              />
            )}

            {message && <div className="text-xs text-green-300">{message}</div>}
            {error && <div className="text-xs text-red-300">{error}</div>}

            <button
              onClick={submit}
              disabled={busy || !email.trim() || (mode !== 'reset' && !password) || (mode === 'sign-up' && !passwordConfirmation)}
              className="w-full py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? t('loading') : primaryLabel}
            </button>

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
    </div>
  );
}
