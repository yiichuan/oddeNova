// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountModal from '../AccountModal';

const authMocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(async (): Promise<void> => undefined),
  signInWithPassword: vi.fn(async (_email: string, _password: string) => ({
    id: 'user-1',
    email: 'listener@example.com',
  })),
  signOut: vi.fn(async (): Promise<void> => undefined),
  signUpWithPassword: vi.fn(async (_email: string, _password: string) => undefined),
  resetPasswordForEmail: vi.fn(async (_email: string) => undefined),
  updatePassword: vi.fn(async (_password: string) => undefined),
}));

vi.mock('../../../services/auth-service', () => ({
  resetPasswordForEmail: authMocks.resetPasswordForEmail,
  signInWithGoogle: authMocks.signInWithGoogle,
  signInWithPassword: authMocks.signInWithPassword,
  signOut: authMocks.signOut,
  signUpWithPassword: authMocks.signUpWithPassword,
  updatePassword: authMocks.updatePassword,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderRecoveryModal() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();

  act(() => {
    root.render(
      <AccountModal
        user={{ id: 'user-1', email: 'listener@example.com' }}
        configured
        recoveringPassword
        onClose={onClose}
      />,
    );
  });

  return { container, root, onClose };
}

function renderSignInModal(oauthErrorKey?: 'authErrorGoogleCancelled') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();

  act(() => {
    root.render(
      <AccountModal
        user={null}
        configured
        oauthErrorKey={oauthErrorKey}
        onClose={onClose}
      />,
    );
  });

  return { container, root, onClose };
}

function renderSignedInModal(beforeSignOut?: () => Promise<void>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();

  act(() => {
    root.render(
      <AccountModal
        user={{ id: 'user-1', email: 'listener@example.com' }}
        configured
        beforeSignOut={beforeSignOut}
        onClose={onClose}
      />,
    );
  });

  return { container, root, onClose };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === label);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found`);
  }
  return button;
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    'value',
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function getSubmitButton(container: HTMLElement): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === 'Update password');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('update password button not found');
  }
  return button;
}

function getButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${text} button not found`);
  }
  return button;
}

describe('AccountModal layering', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
  });

  it('keeps the account dialog above the editor masks', () => {
    const { container, root } = renderSignedInModal();
    roots.push(root);

    const overlay = container.querySelector('div.fixed.inset-0');
    expect(overlay?.classList.contains('z-[300]')).toBe(true);
  });
});

describe('AccountModal password recovery', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('rejects mismatched password confirmation without updating the user', async () => {
    const { container, root, onClose } = renderRecoveryModal();
    roots.push(root);
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type="password"]')];

    expect(inputs).toHaveLength(2);
    setInput(inputs[0], 'new-password');
    setInput(inputs[1], 'different-password');

    await act(async () => {
      getSubmitButton(container).click();
    });

    expect(container.textContent).toContain('Passwords do not match');
    expect(authMocks.updatePassword).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('updates the password and closes the modal when confirmation matches', async () => {
    const { container, root, onClose } = renderRecoveryModal();
    roots.push(root);
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type="password"]')];

    setInput(inputs[0], 'new-password');
    setInput(inputs[1], 'new-password');

    await act(async () => {
      getSubmitButton(container).click();
    });

    expect(authMocks.updatePassword).toHaveBeenCalledWith('new-password');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('AccountModal sign in errors', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows a friendly localized message instead of the Supabase error message', async () => {
    const error = Object.assign(new Error('Invalid login credentials'), {
      code: 'invalid_credentials',
    });
    authMocks.signInWithPassword.mockRejectedValueOnce(error);
    const { container, root, onClose } = renderSignInModal();
    roots.push(root);
    const [emailInput, passwordInput] = [...container.querySelectorAll<HTMLInputElement>('input')];

    setInput(emailInput, 'listener@example.com');
    setInput(passwordInput, 'wrong-password');

    const signInButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Sign in');
    expect(signInButton).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      signInButton?.click();
    });

    expect(container.textContent).toContain('Incorrect email or password. Please check and try again.');
    expect(container.textContent).not.toContain('Invalid login credentials');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses a generic localized message for an unknown error', async () => {
    authMocks.signInWithPassword.mockRejectedValueOnce(new Error('Sensitive backend detail'));
    const { container, root } = renderSignInModal();
    roots.push(root);
    const [emailInput, passwordInput] = [...container.querySelectorAll<HTMLInputElement>('input')];

    setInput(emailInput, 'listener@example.com');
    setInput(passwordInput, 'wrong-password');

    const signInButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Sign in');
    await act(async () => {
      signInButton?.click();
    });

    expect(container.textContent).toContain('Action failed. Please try again later.');
    expect(container.textContent).not.toContain('Sensitive backend detail');
  });
});

describe('AccountModal sign up confirmation', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('rejects mismatched password confirmation without signing up', async () => {
    const { container, root } = renderSignInModal();
    roots.push(root);
    await act(async () => {
      getButton(container, 'Create account').click();
    });
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input')];

    expect(inputs).toHaveLength(3);
    if (inputs.length !== 3) return;
    const [emailInput, passwordInput, confirmationInput] = inputs;
    setInput(emailInput, 'listener@example.com');
    setInput(passwordInput, 'first-password');
    setInput(confirmationInput, 'different-password');

    await act(async () => {
      getButton(container, 'Create account').click();
    });

    expect(container.textContent).toContain('Passwords do not match');
    expect(authMocks.signUpWithPassword).not.toHaveBeenCalled();
  });

  it('submits matching passwords to the registration service', async () => {
    const { container, root } = renderSignInModal();
    roots.push(root);
    await act(async () => {
      getButton(container, 'Create account').click();
    });
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input')];

    expect(inputs).toHaveLength(3);
    if (inputs.length !== 3) return;
    const [emailInput, passwordInput, confirmationInput] = inputs;
    setInput(emailInput, 'listener@example.com');
    setInput(passwordInput, 'matching-password');
    setInput(confirmationInput, 'matching-password');

    await act(async () => {
      getButton(container, 'Create account').click();
    });

    expect(authMocks.signUpWithPassword).toHaveBeenCalledWith('listener@example.com', 'matching-password', 'en');
  });
});

describe('AccountModal reset email', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('passes the active language to the reset email service', async () => {
    const { container, root } = renderSignInModal();
    roots.push(root);
    await act(async () => {
      getButton(container, 'Forgot password?').click();
    });
    const [emailInput] = [...container.querySelectorAll<HTMLInputElement>('input')];
    setInput(emailInput, 'listener@example.com');

    await act(async () => {
      getButton(container, 'Send reset email').click();
    });

    expect(authMocks.resetPasswordForEmail).toHaveBeenCalledWith('listener@example.com', 'en');
  });
});

describe('AccountModal sign out', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('waits for pending cloud saves before ending the auth session', async () => {
    const callOrder: string[] = [];
    let releaseCloudSaves!: () => void;
    const beforeSignOut = vi.fn(() => new Promise<void>((resolve) => {
      releaseCloudSaves = () => {
        callOrder.push('flush');
        resolve();
      };
    }));
    const { container, root, onClose } = renderSignedInModal(beforeSignOut);
    roots.push(root);
    authMocks.signOut.mockImplementationOnce(async () => {
      callOrder.push('signOut');
    });
    onClose.mockImplementationOnce(() => {
      callOrder.push('onClose');
    });

    await act(async () => {
      findButton(container, 'Sign out').click();
    });

    expect(beforeSignOut).toHaveBeenCalledOnce();
    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      releaseCloudSaves();
      await Promise.resolve();
    });

    expect(authMocks.signOut).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(['flush', 'signOut', 'onClose']);
  });

  it('keeps the user signed in when pending cloud saves cannot be flushed', async () => {
    const beforeSignOut = vi.fn(async () => {
      throw new Error('Cloud save failed');
    });
    const { container, root, onClose } = renderSignedInModal(beforeSignOut);
    roots.push(root);

    await act(async () => {
      findButton(container, 'Sign out').click();
      await Promise.resolve();
    });

    expect(beforeSignOut).toHaveBeenCalledOnce();
    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('AccountModal Google sign in', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('starts Google OAuth without closing the modal first', async () => {
    const { container, root, onClose } = renderSignInModal();
    roots.push(root);

    await act(async () => {
      findButton(container, 'Continue with Google').click();
    });

    expect(authMocks.signInWithGoogle).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables every account control while Google OAuth is launching', async () => {
    let finishOAuth: (() => void) | undefined;
    authMocks.signInWithGoogle.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishOAuth = resolve;
    }));
    const { container, root } = renderSignInModal();
    roots.push(root);

    await act(async () => {
      findButton(container, 'Continue with Google').click();
    });

    for (const button of container.querySelectorAll('button')) {
      expect(button.disabled).toBe(true);
    }
    for (const input of container.querySelectorAll('input')) {
      expect(input.disabled).toBe(true);
    }

    await act(async () => {
      finishOAuth?.();
    });
  });

  it('keeps one Google entry point in sign-up and reset modes', () => {
    const { container, root } = renderSignInModal();
    roots.push(root);

    act(() => {
      findButton(container, 'Create account').click();
    });
    expect(findButton(container, 'Continue with Google')).toBeInstanceOf(HTMLButtonElement);

    act(() => {
      findButton(container, 'Forgot password?').click();
    });
    expect(findButton(container, 'Continue with Google')).toBeInstanceOf(HTMLButtonElement);
    expect(
      [...container.querySelectorAll('button')]
        .filter((button) => button.textContent === 'Continue with Google'),
    ).toHaveLength(1);
  });

  it('localizes a Google launch failure without exposing provider details', async () => {
    authMocks.signInWithGoogle.mockRejectedValueOnce(new Error('Sensitive provider detail'));
    const { container, root } = renderSignInModal();
    roots.push(root);

    await act(async () => {
      findButton(container, 'Continue with Google').click();
    });

    expect(container.textContent).toContain('Action failed. Please try again later.');
    expect(container.textContent).not.toContain('Sensitive provider detail');
  });

  it('shows a localized cancellation returned by OAuth', () => {
    const { container, root } = renderSignInModal('authErrorGoogleCancelled');
    roots.push(root);

    expect(container.textContent).toContain('Google sign-in was cancelled.');
  });
});
