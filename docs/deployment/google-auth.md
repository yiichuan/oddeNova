# Google Auth Deployment

oddeNova uses two completely separate authentication tiers. Do not reuse a
Production Supabase project, Google Cloud project, OAuth client, or database in
Preview.

| Tier | Application | Supabase | Google Cloud |
| --- | --- | --- | --- |
| Production | `https://www.oddenova.com` | Production project | Production project, published External audience |
| Preview | Local Vite and protected Vercel Preview deployments | Shared disposable Preview project | Preview project, Testing audience |

The application requests only `openid`, email, and profile. It does not request
offline access and does not store Google provider tokens.

## 1. Create the Google Cloud projects

Create two Google Cloud projects in
[Google Cloud Console](https://console.cloud.google.com/projectcreate):

- `oddeNova Production`
- `oddeNova Preview`

In each project, open **Google Auth Platform**:

1. Under **Branding**, configure the oddeNova application name, support email,
   homepage, privacy policy, and authorized domain.
2. Under **Audience**, choose **External**.
3. Keep Preview in **Testing** and add the team Google accounts as test users.
4. Publish Production when its branding and policy information are ready.
5. Under **Data Access**, configure only `openid`,
   `.../auth/userinfo.email`, and `.../auth/userinfo.profile`.
6. Under **Clients**, create one **Web application** OAuth client.

Google requires separate projects for testing and production deployment tiers:
[OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies).

## 2. Connect each Google client to its Supabase project

Perform these steps once in the Production Supabase project and once in the
Preview Supabase project:

1. Open **Supabase Dashboard → Authentication → Sign In / Providers → Google**.
2. Copy the callback URL shown by Supabase. It has the form
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Add that exact URL to **Google Auth Platform → Clients → Authorized redirect
   URIs** in the matching Google Cloud project.
4. Copy that Google client's Client ID and Client Secret into the matching
   Supabase Google provider settings.
5. Enable the provider and save.

Never put a Google Client Secret in a `VITE_*` variable or commit it to git.
The fixed callback belongs to Supabase; Vercel Preview URLs are application
return URLs and do not need to be added as Google redirect URIs.

Supabase's current Google setup guide is
[Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 3. Configure Supabase return URLs

Open **Supabase Dashboard → Authentication → URL Configuration**.

### Production project

- **Site URL:** `https://www.oddenova.com`
- **Redirect URLs:** `https://www.oddenova.com/**`

Production uses an exact oddeNova host and must not allow a `vercel.app`
wildcard.

### Preview project

Set **Site URL** to the team's stable Vercel branch URL. Add:

```text
http://localhost:5173/**
http://127.0.0.1:5173/**
https://*-YOUR_VERCEL_TEAM_OR_ACCOUNT_SLUG.vercel.app/**
```

Replace `YOUR_VERCEL_TEAM_OR_ACCOUNT_SLUG` with the actual slug shown in the
Vercel team/account URL. Do not widen this to `https://**.vercel.app/**`.

Supabase documents the restricted Vercel glob format in
[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 4. Configure Vercel environments

Open **Vercel Project → Settings → Environment Variables**.

Set these four variables with Production Supabase values in the **Production**
scope:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
```

Set the same four names with Preview Supabase values in the **Preview** scope.
Redeploy after changing variables. The frontend values are publishable; the
server-side copies allow `/api/sessions/*` to validate the user's Supabase JWT
and rely on RLS.

Open **Vercel Project → Settings → Deployment Protection** and require Vercel
Authentication for Preview deployments. Production remains public.

## 5. Configure local development

Create an ignored `.env` file from `.env.example` and fill all four Supabase
variables with the Preview project values:

```text
VITE_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=PREVIEW_PUBLISHABLE_OR_ANON_KEY
SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=PREVIEW_PUBLISHABLE_OR_ANON_KEY
```

The repository does not contain these values. `npm run dev` must never use
Production Supabase credentials.

The optional `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` variables configure Google only
when running a fully local Supabase stack with `supabase start`; they are not
required when local Vite connects to the hosted Preview project.

## 6. Manual acceptance

After all dashboard settings are applied:

1. **Local:** run `npm run dev`, sign in and out with a Preview test Google
   account, and confirm the browser returns to the same pathname and query.
2. **Vercel Preview:** authenticate through a Deployment-Protected Preview URL
   and confirm the same Preview account sees the same disposable data as local.
3. **Production:** authenticate at `https://www.oddenova.com` and confirm the
   account sees only Production data.
4. **Identity linking:** create an email/password account, then use Google with
   the same verified email. Confirm both methods produce the same Supabase user
   ID and cloud sessions.
5. **Guest import:** create local guest history before Google login. Confirm
   oddeNova asks before syncing and declining leaves local history intact.
6. **Failure:** cancel Google authorization. Confirm the account modal reopens
   with localized copy and the current local work is unchanged.
7. **Isolation:** confirm a Preview user/session does not exist in Production.

Until both external tiers are configured and these checks pass, repository
tests prove only the application behavior—not a live Google OAuth integration.
