# Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add button-driven Google sign-in through Supabase Auth while preserving email/password behavior, guest-history import, current-page return, localized failures, and strict Production/Preview isolation.

**Architecture:** The existing Supabase browser client remains the only session authority. A focused browser helper owns the short-lived OAuth marker and safe callback-error cleanup; `auth-service.ts` starts Google OAuth; `useAuth.ts` exposes callback errors; the existing account modal and App shell display the new entry point and reuse the current guest-import transition.

**Tech Stack:** React 19, TypeScript 6, `@supabase/supabase-js` 2, Vitest, happy-dom, Vite, Supabase Auth, Vercel

## Global Constraints

- Keep email/password sign-in, sign-up, password recovery, password update, and sign-out behavior unchanged.
- Google is the only social provider in this release.
- Use Supabase `signInWithOAuth`; do not load Google Identity Services or create a Vercel OAuth callback.
- Request exactly `openid email profile`; do not request offline access or retain Google provider tokens.
- Return to the originating origin, pathname, and query string; do not carry an existing URL fragment into `redirectTo`.
- Keep OAuth pending state for at most 15 minutes in `sessionStorage`.
- Never show raw provider error descriptions to users.
- Do not add One Tap, avatar/name UI, manual unlinking, or a general identity-management screen.
- Production and Preview use separate Supabase projects and separate Google Cloud projects.
- Local development and Vercel Preview share the non-production Supabase project.
- Preview deployments remain team-only behind Vercel Deployment Protection.

---

## File Structure

- Create `src/lib/google-oauth-return.ts`: pending-marker lifetime, OAuth callback classification, and removal of only OAuth error parameters.
- Create `src/lib/__tests__/google-oauth-return.test.ts`: pure browser-state regression tests.
- Modify `src/services/auth-service.ts`: start Google OAuth and clear pending state after successful authentication.
- Create `src/services/__tests__/auth-service.test.ts`: verify the exact Supabase OAuth request and launch-failure behavior.
- Modify `src/hooks/useAuth.ts`: expose callback error key and dismissal.
- Modify `src/hooks/__tests__/useAuth.test.ts`: verify callback result and pending-state cleanup.
- Modify `src/components/AccountModal.tsx`: render and launch the single Google entry point.
- Modify `src/components/__tests__/AccountModal.test.tsx`: verify visibility, launch, disabled state, and localized errors.
- Modify `src/App.tsx`: open the account modal for an OAuth callback error and dismiss it explicitly.
- Modify `src/lib/i18n.ts`: add Chinese and English Google labels and error copy.
- Modify `src/lib/auth-error.ts`: map Google launch/network and identity-conflict errors to stable localized keys.
- Modify `src/lib/__tests__/auth-error.test.ts`: cover the new stable error codes.
- Modify `supabase/config.toml`: document local CLI Google provider settings without secrets.
- Modify `.env.example`: document local Preview Supabase values and Google CLI-only variables.
- Create `docs/deployment/google-auth.md`: exact two-tier external setup and manual smoke checklist.
- Modify `docs/superpowers/specs/2026-07-18-google-sign-in-design.md`: clarify that the return URL preserves the query string.

---

### Task 1: OAuth Return State

**Files:**
- Create: `src/lib/google-oauth-return.ts`
- Create: `src/lib/__tests__/google-oauth-return.test.ts`

**Interfaces:**
- Produces: `markGoogleOAuthPending(): void`
- Produces: `clearGoogleOAuthPending(): void`
- Produces: `consumeGoogleOAuthReturn(): GoogleOAuthErrorKey | null`
- Produces: `type GoogleOAuthErrorKey = 'authErrorGoogleCancelled' | 'authErrorGoogleFailed' | 'authErrorGoogleIdentityConflict'`

- [ ] **Step 1: Write failing callback-state tests**

```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGoogleOAuthPending,
  consumeGoogleOAuthReturn,
  markGoogleOAuthPending,
} from '../google-oauth-return';

describe('Google OAuth return state', () => {
  beforeEach(() => {
    sessionStorage.clear();
    history.replaceState(null, '', '/compose?demo=true');
    vi.restoreAllMocks();
  });

  it('classifies access_denied as cancellation and removes OAuth parameters', () => {
    markGoogleOAuthPending();
    history.replaceState(null, '', '/compose?demo=true#error=access_denied&error_description=cancelled');

    expect(consumeGoogleOAuthReturn()).toBe('authErrorGoogleCancelled');
    expect(location.pathname + location.search + location.hash).toBe('/compose?demo=true');
  });

  it('preserves an unrelated oddeNova import fragment while removing an OAuth error', () => {
    markGoogleOAuthPending();
    history.replaceState(
      null,
      '',
      '/#oddenova=payload&error=server_error&error_description=secret',
    );

    expect(consumeGoogleOAuthReturn()).toBe('authErrorGoogleFailed');
    expect(location.hash).toBe('#oddenova=payload');
  });

  it('ignores OAuth-looking parameters without a pending marker', () => {
    history.replaceState(null, '', '/#error=access_denied');

    expect(consumeGoogleOAuthReturn()).toBeNull();
    expect(location.hash).toBe('#error=access_denied');
  });

  it('expires a pending marker after fifteen minutes', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000);
    markGoogleOAuthPending();
    vi.spyOn(Date, 'now').mockReturnValue(1_000 + 15 * 60_000 + 1);
    history.replaceState(null, '', '/#error=access_denied');

    expect(consumeGoogleOAuthReturn()).toBeNull();
    clearGoogleOAuthPending();
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npx vitest run src/lib/__tests__/google-oauth-return.test.ts
```

Expected: FAIL because `src/lib/google-oauth-return.ts` does not exist.

- [ ] **Step 3: Implement the marker and callback consumer**

```ts
export type GoogleOAuthErrorKey =
  | 'authErrorGoogleCancelled'
  | 'authErrorGoogleFailed'
  | 'authErrorGoogleIdentityConflict';

const PENDING_KEY = 'oddenova_google_oauth_pending_at';
const PENDING_TTL_MS = 15 * 60_000;
const OAUTH_ERROR_KEYS = ['error', 'error_code', 'error_description'] as const;

export function markGoogleOAuthPending(): void {
  window.sessionStorage.setItem(PENDING_KEY, String(Date.now()));
}

export function clearGoogleOAuthPending(): void {
  window.sessionStorage.removeItem(PENDING_KEY);
}

function hasFreshPendingMarker(): boolean {
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  const startedAt = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(startedAt) || Date.now() - startedAt > PENDING_TTL_MS) {
    clearGoogleOAuthPending();
    return false;
  }
  return true;
}

export function consumeGoogleOAuthReturn(): GoogleOAuthErrorKey | null {
  if (!hasFreshPendingMarker()) return null;

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const error = url.searchParams.get('error') ?? hashParams.get('error');
  const errorCode = url.searchParams.get('error_code') ?? hashParams.get('error_code');
  if (!error && !errorCode) return null;

  clearGoogleOAuthPending();
  for (const key of OAUTH_ERROR_KEYS) {
    url.searchParams.delete(key);
    hashParams.delete(key);
  }
  const remainingHash = hashParams.toString();
  url.hash = remainingHash ? `#${remainingHash}` : '';
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);

  const code = errorCode ?? error;
  if (code === 'access_denied') return 'authErrorGoogleCancelled';
  if (code === 'identity_already_exists' || code === 'email_exists') {
    return 'authErrorGoogleIdentityConflict';
  }
  return 'authErrorGoogleFailed';
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest run src/lib/__tests__/google-oauth-return.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google-oauth-return.ts src/lib/__tests__/google-oauth-return.test.ts
git commit -m "feat: track Google OAuth returns"
```

---

### Task 2: Supabase Google OAuth Entry Point

**Files:**
- Modify: `src/services/auth-service.ts`
- Create: `src/services/__tests__/auth-service.test.ts`
- Modify: `src/hooks/useAuth.ts`
- Modify: `src/hooks/__tests__/useAuth.test.ts`

**Interfaces:**
- Consumes: `markGoogleOAuthPending`, `clearGoogleOAuthPending`, and `consumeGoogleOAuthReturn` from Task 1.
- Produces: `signInWithGoogle(): Promise<void>`
- Produces: `UseAuthState.oauthErrorKey: GoogleOAuthErrorKey | null`
- Produces: `UseAuthState.dismissOAuthError(): void`

- [ ] **Step 1: Write the failing service test**

Create a happy-dom test that stubs `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`, mocks `createClient`, and asserts:

```ts
await signInWithGoogle();

expect(auth.signInWithOAuth).toHaveBeenCalledWith({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/compose?demo=true`,
    scopes: 'openid email profile',
  },
});
expect(sessionStorage.getItem('oddenova_google_oauth_pending_at')).not.toBeNull();
```

Add a second test where `signInWithOAuth` returns an error and assert the
function rejects and the pending marker is removed.

- [ ] **Step 2: Run the service test and verify RED**

Run:

```bash
npx vitest run src/services/__tests__/auth-service.test.ts
```

Expected: FAIL because `signInWithGoogle` is not exported.

- [ ] **Step 3: Implement the minimal service behavior**

Add to `src/services/auth-service.ts`:

```ts
export async function signInWithGoogle(): Promise<void> {
  const client = requireSupabase();
  markGoogleOAuthPending();
  const redirectTo =
    `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: 'openid email profile',
    },
  });
  if (error) {
    clearGoogleOAuthPending();
    throw error;
  }
}
```

Clear the pending marker after `getCurrentUser()` returns a user and from the
auth state listener when the session contains a user.

- [ ] **Step 4: Run the service test and verify GREEN**

Run:

```bash
npx vitest run src/services/__tests__/auth-service.test.ts
```

Expected: both tests pass.

- [ ] **Step 5: Write failing hook tests**

Extend the auth-service mock and assert:

```ts
expect(getHook().oauthErrorKey).toBe('authErrorGoogleCancelled');

act(() => getHook().dismissOAuthError());

expect(getHook().oauthErrorKey).toBeNull();
```

Also assert that a `SIGNED_IN` event still exposes the same `{ id, email }`
shape used by email/password sign-in.

- [ ] **Step 6: Run the hook test and verify RED**

Run:

```bash
npx vitest run src/hooks/__tests__/useAuth.test.ts
```

Expected: FAIL because the hook has no OAuth result fields.

- [ ] **Step 7: Implement the hook fields**

Initialize `oauthErrorKey` from `consumeGoogleOAuthReturn()` and expose a
memoized `dismissOAuthError` callback that sets only that field to `null`.
Every `setState` performed by `getCurrentUser` or `onAuthStateChange` must
preserve the current OAuth error unless it is explicitly dismissed.

- [ ] **Step 8: Run service and hook tests**

Run:

```bash
npx vitest run src/services/__tests__/auth-service.test.ts src/hooks/__tests__/useAuth.test.ts
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/services/auth-service.ts src/services/__tests__/auth-service.test.ts src/hooks/useAuth.ts src/hooks/__tests__/useAuth.test.ts
git commit -m "feat: start Google sign-in with Supabase"
```

---

### Task 3: Account Modal and Localized Failures

**Files:**
- Modify: `src/components/AccountModal.tsx`
- Modify: `src/components/__tests__/AccountModal.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/i18n.ts`
- Modify: `src/lib/auth-error.ts`
- Modify: `src/lib/__tests__/auth-error.test.ts`

**Interfaces:**
- Consumes: `signInWithGoogle()` and `UseAuthState.oauthErrorKey` from Task 2.
- Adds optional prop: `AccountModalProps.oauthErrorKey?: GoogleOAuthErrorKey | null`
- Keeps existing `onClose(): void` contract.

- [ ] **Step 1: Write failing error-mapping tests**

Add these rows to `src/lib/__tests__/auth-error.test.ts`:

```ts
['identity_already_exists', 'authErrorGoogleIdentityConflict'],
['email_exists', 'authErrorGoogleIdentityConflict'],
```

Run:

```bash
npx vitest run src/lib/__tests__/auth-error.test.ts
```

Expected: FAIL because the new keys are not mapped.

- [ ] **Step 2: Add stable mappings and localized copy**

Add mappings in `src/lib/auth-error.ts` and add bilingual strings in
`src/lib/i18n.ts`:

```ts
continueWithGoogle: ['使用 Google 继续', 'Continue with Google'],
orUseEmail: ['或使用邮箱', 'or use email'],
authErrorGoogleCancelled: ['已取消 Google 登录。', 'Google sign-in was cancelled.'],
authErrorGoogleFailed: ['Google 登录失败，请重试。', 'Google sign-in failed. Please try again.'],
authErrorGoogleIdentityConflict: [
  '该邮箱已有账号，请先使用邮箱密码登录后再重试。',
  'An account already uses this email. Sign in with email and password, then try again.',
],
```

Run:

```bash
npx vitest run src/lib/__tests__/auth-error.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Write failing account-modal tests**

Extend the auth-service mock with `signInWithGoogle`. Add tests that assert:

```ts
expect(findButton(container, 'Continue with Google')).toBeInstanceOf(HTMLButtonElement);

await act(async () => {
  findButton(container, 'Continue with Google').click();
});
expect(authMocks.signInWithGoogle).toHaveBeenCalledOnce();
expect(onClose).not.toHaveBeenCalled();
```

Render the modal in sign-up and reset modes and assert the same single Google
button remains visible. Add a rejected launch test and assert only the generic
localized message appears, never the raw provider detail. Render with
`oauthErrorKey="authErrorGoogleCancelled"` and assert the cancellation copy is
visible.

- [ ] **Step 4: Run the modal tests and verify RED**

Run:

```bash
npx vitest run src/components/__tests__/AccountModal.test.tsx
```

Expected: FAIL because the Google button and prop do not exist.

- [ ] **Step 5: Implement the modal**

Import `signInWithGoogle` and `GoogleOAuthErrorKey`. Initialize local error
state from `oauthErrorKey`, add `handleGoogleSignIn`, and render one full-width
Google button above an “or use email” divider in every signed-out mode.

Use the existing `run` wrapper so synchronous launch failures are localized.
Do not call `onClose` after `signInWithGoogle`; the browser redirect owns the
successful transition.

- [ ] **Step 6: Connect callback errors in App**

Render the overlay when either `accountOpen` or `auth.oauthErrorKey` is truthy:

```tsx
{(accountOpen || auth.oauthErrorKey) && (
  <AccountModal
    user={auth.user}
    configured={auth.configured}
    recoveringPassword={auth.recoveringPassword}
    oauthErrorKey={auth.oauthErrorKey}
    onClose={() => {
      auth.dismissOAuthError();
      setAccountOpen(false);
    }}
  />
)}
```

This keeps the error visible until the user explicitly closes the modal and
does not create an OAuth-specific guest-history path.

- [ ] **Step 7: Run focused UI and auth tests**

Run:

```bash
npx vitest run src/components/__tests__/AccountModal.test.tsx src/hooks/__tests__/useAuth.test.ts src/lib/__tests__/auth-error.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/AccountModal.tsx src/components/__tests__/AccountModal.test.tsx src/App.tsx src/lib/i18n.ts src/lib/auth-error.ts src/lib/__tests__/auth-error.test.ts
git commit -m "feat: add Google account entry point"
```

---

### Task 4: Environment Contract and Operator Guide

**Files:**
- Modify: `supabase/config.toml`
- Modify: `.env.example`
- Create: `docs/deployment/google-auth.md`
- Modify: `docs/superpowers/specs/2026-07-18-google-sign-in-design.md`

**Interfaces:**
- Documents local CLI variables: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`
- Documents Vercel application variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`

- [ ] **Step 1: Write the repository configuration**

Add:

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
skip_nonce_check = false
email_optional = false
```

Add the two CLI-only Google variables and the missing server-side
`SUPABASE_URL` entry to `.env.example`. State that local application variables
must point to the hosted Preview Supabase project, while the Google variables
are used only by `supabase start`.

- [ ] **Step 2: Write the external configuration guide**

`docs/deployment/google-auth.md` must give exact dashboard paths and require:

1. two Google Cloud projects, Production published and Preview Testing;
2. `openid`, email, and profile scopes only;
3. one callback URL copied from each Supabase Google provider page into its
   matching Google Web OAuth client;
4. Production Supabase Site URL `https://www.oddenova.com`;
5. Preview allow-list entries for the actual local Vite origin and
   `https://*-<actual-team-or-account-slug>.vercel.app/**`;
6. separate Vercel Production and Preview environment-variable values;
7. Vercel Deployment Protection for Preview;
8. the four manual acceptance scenarios, including same-email identity linking
   and Production/Preview data isolation.

Do not include secrets or claim that dashboard configuration has been applied.

- [ ] **Step 3: Align the design return-URL wording**

Change “current origin plus pathname” to “current origin, pathname, and query
string; exclude the fragment” in the approved design.

- [ ] **Step 4: Validate repository configuration**

Run:

```bash
rg -n "SUPABASE_AUTH_EXTERNAL_GOOGLE|VITE_SUPABASE_URL|SUPABASE_URL|vercel.app|www.oddenova.com" .env.example supabase/config.toml docs/deployment/google-auth.md
git diff --check
```

Expected: both Google CLI variables, all four app Supabase variables, the
production URL, and the restricted Vercel glob are present; `git diff --check`
exits 0.

- [ ] **Step 5: Commit**

```bash
git add .env.example supabase/config.toml docs/deployment/google-auth.md
git add -f docs/superpowers/specs/2026-07-18-google-sign-in-design.md
git commit -m "docs: define Google auth environments"
```

---

### Task 5: Full Verification

**Files:**
- Verify all files changed in Tasks 1–4.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run the focused auth suite**

Run:

```bash
npx vitest run src/lib/__tests__/google-oauth-return.test.ts src/services/__tests__/auth-service.test.ts src/hooks/__tests__/useAuth.test.ts src/components/__tests__/AccountModal.test.tsx src/lib/__tests__/auth-error.test.ts
```

Expected: all focused tests pass with no warnings or unhandled errors.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: exit 0 with no failing test files.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: exit 0 with no warnings or errors.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite both exit 0.

- [ ] **Step 5: Inspect the final diff and requirement coverage**

Run:

```bash
git diff HEAD~4 --check
git status --short
git log -5 --oneline
```

Verify every design requirement has either implementation evidence or is
listed explicitly as an external/manual configuration step. Do not claim real
Google login works until the two Google Cloud projects, two Supabase projects,
Vercel variables, and Deployment Protection have been configured and the
manual smoke tests have run.
