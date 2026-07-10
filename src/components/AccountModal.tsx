import { useState } from 'react';
import {
  resetPasswordForEmail,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword,
  type AuthUser,
} from '../services/auth-service';
import { getAuthErrorMessageKey } from '../lib/auth-error';
import { t } from '../lib/i18n';

type Mode = 'sign-in' | 'sign-up' | 'reset';

interface AccountModalProps {
  user: AuthUser | null;
  configured: boolean;
  recoveringPassword?: boolean;
  onClose: () => void;
}

export default function AccountModal({
  user,
  configured,
  recoveringPassword = false,
  onClose,
}: AccountModalProps) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
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
      if (!password) return;
      void run(async () => {
        await signUpWithPassword(trimmedEmail, password);
        setPassword('');
        setMessage(t('confirmEmailSent'));
        setMode('sign-in');
      });
      return;
    }

    void run(async () => {
      await resetPasswordForEmail(trimmedEmail);
      setMessage(t('passwordResetSent'));
      setMode('sign-in');
    });
  };

  const handleSignOut = () => {
    void run(async () => {
      await signOut();
      onClose();
    });
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
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-sm">{t('close')}</button>
        </div>

        {!configured ? (
          <div className="text-sm text-red-300">{t('supabaseNotConfigured')}</div>
        ) : recoveringPassword ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-text-secondary mb-1 block">{t('newPassword')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                className="w-full bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">{t('confirmNewPassword')}</label>
              <input
                type="password"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordUpdate()}
                className="w-full bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
              />
            </div>

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
            <div>
              <label className="text-xs text-text-secondary mb-1 block">{t('email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                className="w-full bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
                autoFocus
              />
            </div>
            {mode !== 'reset' && (
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  className="w-full bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
                />
              </div>
            )}

            {message && <div className="text-xs text-green-300">{message}</div>}
            {error && <div className="text-xs text-red-300">{error}</div>}

            <button
              onClick={submit}
              disabled={busy || !email.trim() || (mode !== 'reset' && !password)}
              className="w-full py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? t('loading') : primaryLabel}
            </button>

            <div className="flex items-center justify-between text-xs">
              <button
                onClick={() => { setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'); setError(''); setMessage(''); }}
                className="text-text-muted hover:text-text-primary"
              >
                {mode === 'sign-up' ? t('haveAccount') : t('needAccount')}
              </button>
              <button
                onClick={() => { setMode(mode === 'reset' ? 'sign-in' : 'reset'); setError(''); setMessage(''); }}
                className="text-text-muted hover:text-text-primary"
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
