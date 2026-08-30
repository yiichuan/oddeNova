// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WelcomeModal from '../WelcomeModal';

const authMocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(async (): Promise<void> => undefined),
  signInWithPassword: vi.fn(async (_email: string, _password: string) => ({
    id: 'user-1',
    email: 'listener@example.com',
  })),
  signUpWithPassword: vi.fn(async (_email: string, _password: string) => undefined),
}));

vi.mock('../../../services/auth-service', () => ({
  signInWithGoogle: authMocks.signInWithGoogle,
  signInWithPassword: authMocks.signInWithPassword,
  signUpWithPassword: authMocks.signUpWithPassword,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderModal() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();

  act(() => {
    root.render(<WelcomeModal configured onClose={onClose} />);
  });

  return { container, root, onClose };
}

function getButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${text} button not found`);
  }
  return button;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
}

function inputs(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll('input')];
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

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('WelcomeModal', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('opens on the invitation: Google, an email address, and nothing else to fill in', () => {
    const { container, root } = renderModal();
    roots.push(root);

    expect(container.textContent).toContain('oddeNova: Welcome!');
    expect(findButton(container, 'Continue with Google')).toBeDefined();
    expect(findButton(container, 'Continue with email')).toBeDefined();
    expect(inputs(container)).toHaveLength(1);
    expect(container.textContent).not.toContain('Already have an account?');
  });

  it('turns into an account on the first press rather than submitting one', () => {
    const { container, root } = renderModal();
    roots.push(root);

    setInput(inputs(container)[0], 'listener@example.com');
    click(getButton(container, 'Continue with email'));

    expect(authMocks.signUpWithPassword).not.toHaveBeenCalled();
    expect(inputs(container)).toHaveLength(2);
    expect(findButton(container, 'Continue with email')).toBeUndefined();
    expect(findButton(container, 'Create account')).toBeDefined();
    expect(container.textContent).toContain('Already have an account?');
  });

  it('will not step forward without an email address', () => {
    const { container, root } = renderModal();
    roots.push(root);

    click(getButton(container, 'Continue with email'));

    expect(inputs(container)).toHaveLength(1);
  });

  it('creates the account from the email and password on screen', async () => {
    const { container, root } = renderModal();
    roots.push(root);

    setInput(inputs(container)[0], 'listener@example.com');
    click(getButton(container, 'Continue with email'));
    setInput(inputs(container)[1], 'hunter2hunter2');

    await act(async () => {
      getButton(container, 'Create account').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(authMocks.signUpWithPassword).toHaveBeenCalledWith(
      'listener@example.com',
      'hunter2hunter2',
      'en',
    );
  });

  it('follows the sign-in link to a window that signs in instead', async () => {
    const { container, root, onClose } = renderModal();
    roots.push(root);

    setInput(inputs(container)[0], 'listener@example.com');
    click(getButton(container, 'Continue with email'));
    click(getButton(container, 'Sign in'));

    expect(container.textContent).not.toContain('Already have an account?');
    expect(findButton(container, 'Create account')).toBeUndefined();

    setInput(inputs(container)[1], 'hunter2hunter2');
    await act(async () => {
      getButton(container, 'Sign in').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(authMocks.signInWithPassword).toHaveBeenCalledWith(
      'listener@example.com',
      'hunter2hunter2',
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('lets the sign-in window turn back into a sign-up', () => {
    const { container, root } = renderModal();
    roots.push(root);

    setInput(inputs(container)[0], 'listener@example.com');
    click(getButton(container, 'Continue with email'));
    click(getButton(container, 'Sign in'));

    expect(container.textContent).toContain('No account yet?');

    click(getButton(container, 'Sign up'));

    expect(container.textContent).toContain('Already have an account?');
    expect(findButton(container, 'Create account')).toBeDefined();
  });

  it('hands off to Google', async () => {
    const { container, root } = renderModal();
    roots.push(root);

    await act(async () => {
      getButton(container, 'Continue with Google').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(authMocks.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it('says so when auth is not configured', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(<WelcomeModal configured={false} onClose={vi.fn()} />);
    });

    expect(findButton(container, 'Continue with Google')).toBeUndefined();
    expect(container.textContent).toContain('Supabase is not configured');
  });
});
