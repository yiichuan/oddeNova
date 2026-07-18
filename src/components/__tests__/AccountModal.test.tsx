// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountModal from '../AccountModal';

const authMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async (_email: string, _password: string) => ({
    id: 'user-1',
    email: 'listener@example.com',
  })),
  signUpWithPassword: vi.fn(async (_email: string, _password: string) => undefined),
  updatePassword: vi.fn(async (_password: string) => undefined),
}));

vi.mock('../../services/auth-service', () => ({
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: authMocks.signInWithPassword,
  signOut: vi.fn(),
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

function renderSignInModal() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();

  act(() => {
    root.render(
      <AccountModal
        user={null}
        configured
        onClose={onClose}
      />,
    );
  });

  return { container, root, onClose };
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

    expect(authMocks.signUpWithPassword).toHaveBeenCalledWith('listener@example.com', 'matching-password');
  });
});
