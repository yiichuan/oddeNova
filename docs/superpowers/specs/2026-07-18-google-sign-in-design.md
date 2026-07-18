# Google Sign-In Design

Date: 2026-07-18

## Goal

Add Google as the only social sign-in method alongside the existing email and
password flow. A user who signs in with either method must reach the same
oddeNova account, cloud sessions, and guest-history import behavior.

## Principles

- Keep email/password registration, sign-in, recovery, and sign-out unchanged.
- Use Supabase Auth as the sole application identity and session authority.
- Request only `openid`, email, and basic profile scopes. Do not retain or use
  Google provider tokens.
- Preserve the current page, local session, and guest data across the OAuth
  redirect.
- Treat Production and Preview as separate security and data boundaries.
- Keep the first release button-driven. Do not add Google One Tap, profile
  editing, avatar display, unlinking, or other social providers.

## Chosen Approach

The application will call Supabase `signInWithOAuth({ provider: 'google' })`
from the existing browser Supabase client. Supabase will own the redirect,
Google callback exchange, persisted Supabase session, and automatic identity
linking.

This is preferred over two alternatives:

1. Loading Google Identity Services and exchanging an ID token in the browser
   adds a third-party script, nonce handling, and One Tap-oriented behavior
   that the first release does not need.
2. Owning an OAuth callback in a Vercel Function duplicates capabilities
   already provided by Supabase Auth and would introduce a second session
   boundary.

Supabase automatically links a verified OAuth identity to an existing user
with the same email. Email/password and Google therefore remain two identities
of one Supabase user and keep the same user ID. General-purpose manual linking
and unlinking are outside this release. An unexpected identity-linking failure
must not create an application-side merged account; it returns the user to the
account modal with a localized error.

## Environment Topology

Two hosted Supabase projects are required:

| Application environment | Supabase project | Data policy |
| --- | --- | --- |
| Production (`https://www.oddenova.com`) | Production | Durable real-user data |
| Local Vite development | Preview | Shared disposable test data |
| All Vercel Preview deployments | Preview | Shared disposable test data |

Local and Vercel Preview use the same Preview Supabase URL and anon key.
Preview users and sessions can be shared across branches and may be cleared at
any time. Production credentials must never be exposed to Preview deployments
or local `.env` files.

Vercel Preview deployments must be protected with Vercel Deployment
Protection and limited to team members. The Preview-scoped environment
variables are:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
```

The corresponding Production-scoped variables point only to the Production
Supabase project. Local development uses the Preview values in an ignored
`.env` file.

## Google and Supabase Configuration

Two Google Cloud projects provide one Web OAuth client each:

- Production Google Cloud project: its Web OAuth client's authorized redirect
  URI is the Production Supabase callback URL.
- Preview Google Cloud project: its Web OAuth client's authorized redirect URI
  is the Preview Supabase callback URL.

The Production consent screen is published for external users. The Preview
project remains in Testing and lists only team members as test users. Both
projects configure only `openid`, email, and profile scopes. No offline access
or Google API scopes are requested. Keeping deployment tiers in separate
Google Cloud projects also follows Google's OAuth policy.

Each Supabase project's Google provider stores only its matching client ID and
secret. Supabase Site URL and application redirect allow lists are:

- Production Site URL: `https://www.oddenova.com`
- Production additional redirect: the exact production application URL
- Preview Site URL: the canonical Vercel Preview/branch URL chosen by the team
- Preview additional redirects:
  - the exact local Vite origin
  - a Vercel glob restricted to oddeNova deployments under the actual Vercel
    team or account slug

The Preview glob must follow Supabase's documented shape
`https://*-<team-or-account-slug>.vercel.app/**`. It must not be widened to
all `vercel.app` deployments.

Repository `supabase/config.toml` documents and enables the Google provider for
local Supabase CLI use with credentials supplied through environment
variables. Hosted Production and Preview settings remain dashboard/management
configuration and do not store OAuth secrets in git.

## Application Components

### Authentication service

`src/services/auth-service.ts` adds a single Google OAuth entry point. It calls
`signInWithOAuth` with:

- `provider: 'google'`
- `redirectTo` set to the current origin, pathname, and query string; the
  current fragment is excluded

The function records a short-lived pending marker in `sessionStorage` before
redirecting. It does not request offline access, provider refresh tokens, or
additional scopes.

The same service consumes OAuth callback failures only when that pending marker
exists. It converts provider cancellation and OAuth failures into stable
application result codes, removes OAuth error parameters from the visible URL,
and clears the marker. Unrelated URL fragments, including oddeNova's Strudel
import fragment, must remain untouched.

### Authentication hook and application shell

`src/hooks/useAuth.ts` exposes an optional Google OAuth result alongside the
existing user, configuration, loading, and password-recovery state. Supabase
auth events continue to be the only source of signed-in user state.

On a failed or cancelled Google return, `src/App.tsx` opens the existing
account modal. On success, the normal auth-user transition closes over the
restored browser state and triggers the existing guest-history inspection.
No OAuth-specific guest import implementation is added.

### Account modal

`src/components/AccountModal.tsx` shows one localized “Continue with Google”
button whenever the visitor is signed out, in sign-in, sign-up, and password
reset modes. A divider separates it from the email/password controls.

Clicking the button starts the redirect and disables all account actions while
the request is pending. A synchronous launch failure stays in the modal and is
mapped through the existing localized auth error system.

The modal does not show Google avatar or display name. Signed-in account
display remains the email address. Sign-out continues to end only the
oddeNova/Supabase session and does not sign the user out of Google.

## Data Flow

1. The user clicks “Continue with Google.”
2. The app stores a pending OAuth marker and asks Supabase to start Google
   OAuth with the current application URL as `redirectTo`.
3. The browser redirects through Supabase and Google, then returns to the same
   application origin and path.
4. Supabase restores its persisted session and emits the existing auth state
   change.
5. If Google verified an email already owned by an email/password user,
   Supabase automatic identity linking preserves that Supabase user ID.
6. Existing `useSessions` ownership and cloud synchronization use that user ID.
7. Existing guest-history detection asks before importing local guest sessions.
   Declining leaves guest data local.

If the user cancels or Google/Supabase returns an error, no signed-in user is
created. The app opens the account modal, shows a localized cancellation or
failure message, and leaves the current local work unchanged.

## Error Handling

- User cancellation: “Google sign-in was cancelled.”
- Provider or callback failure: a localized Google sign-in failure message.
- Network failure before redirect: the existing localized network message.
- Supabase not configured: keep the existing guest-mode configuration message
  and disable Google sign-in.
- Unexpected identity-linking conflict: do not merge application records or
  create a second application identity; show a localized instruction to sign
  in with the existing email method.

OAuth error descriptions from Google or Supabase are never shown verbatim.

## Testing and Acceptance

Automated tests cover:

- the service calls `signInWithOAuth` for Google with the current URL;
- pending state is recorded before redirect;
- the Google button exists in signed-out account modes and launches OAuth;
- launch failures remain in the modal and use localized copy;
- cancellation and callback failure reopen the modal with localized copy;
- unrelated URL fragments are preserved;
- password recovery and email/password tests remain green;
- a successful OAuth auth event follows the existing guest-import trigger.

Fresh verification requires the focused tests, full Vitest suite, TypeScript
build, and lint.

Manual acceptance requires one real Google sign-in and sign-out in each of:

1. local Vite development using Preview Supabase;
2. a Deployment-Protected Vercel Preview using Preview Supabase;
3. `https://www.oddenova.com` using Production Supabase.

The same verified email must reach the same user ID and cloud data through
email/password and Google inside one environment. A Preview account or session
must not appear in Production.

## External Configuration Boundary

Code and repository documentation can be completed locally. Creating Google
OAuth clients, changing hosted Supabase Auth settings, assigning Vercel
environment variables, and enabling Deployment Protection require authorized
access to those services. The feature is not production-ready until those
external steps and the three manual smoke tests are complete.
