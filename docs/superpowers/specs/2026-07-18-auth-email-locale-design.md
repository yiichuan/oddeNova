# Auth email language selection

## Goal

Send each authentication email in the language selected by the user at the time
they trigger the operation. The supported values are Chinese (`zh`) and English
(`en`). This applies to sign-up confirmation and password recovery emails.

## Decision

Use a small Vercel server endpoint as the email delivery boundary. The browser
sends the current language with each request; the endpoint validates a fixed
operation type, creates the appropriate Supabase Auth action link, selects the
matching localized template, and sends it through the configured transactional
email provider.

The existing Supabase template files remain the version-controlled visual source
for the email layout. Localized variants are represented in the repository so
the production provider templates can be kept in sync.

## Data flow

1. The account UI obtains the current application language (`zh` or `en`).
2. It requests an authentication email with the operation (`confirmation` or
   `recovery`), email address, and language.
3. The server validates the input and uses server-only Supabase credentials to
   create a one-time action link.
4. The server chooses the localized subject and HTML content, injects only the
   generated action link and recipient email, then sends the message.
5. The browser receives a deliberately generic success response for recovery,
   so it cannot be used to discover whether an address is registered.

## API boundary

`POST /api/auth/email`

Request body:

```json
{
  "type": "confirmation | recovery",
  "email": "user@example.com",
  "language": "zh | en"
}
```

Invalid operation types, malformed email addresses, unsupported languages, or
missing server-side configuration fail safely. The endpoint never returns an
action link, Supabase credentials, provider errors, or account-existence
information to the browser.

## Templates

- Each operation has a Chinese and English subject/body pair.
- Copy, CTA label, explanatory text, and document language match the requested
  language; the link target and brand styling remain identical.
- All templates preserve a visible fallback URL and use the generated one-time
  action link.
- Existing users receive password-recovery emails in the language of this
  request, not a language stored at registration.

## Error handling and security

- Supabase service credentials and the mail-provider key exist only in the
  server runtime.
- Password-recovery responses stay generic regardless of whether the address
  exists.
- Generated action links are short-lived and single-use according to Supabase
  Auth configuration.
- Rate limiting remains enforced by the appropriate sender/auth provider; the
  endpoint does not expose an account enumeration signal.

## Tests

- Unit-test localized template selection for both operations and both
  languages, including a fallback for invalid language values.
- Test endpoint validation and generic recovery responses.
- Retain regression checks that each rendered template includes the required
  action URL and fallback URL.
- Perform a development smoke test using a safe recipient and inspect the
  received Chinese and English messages.

## Out of scope

- Additional Auth email categories such as invitation, email-change, and
  security notifications.
- A user-facing language preference control.
- Changes to authentication, session persistence, or account UI beyond routing
  the two existing email actions through this endpoint.
