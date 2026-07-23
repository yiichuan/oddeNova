# Auth Email Generic Success Copy Design

Date: 2026-07-22

## Goal

Make the email/password account flow accurately describe Supabase Auth's
privacy-preserving email behavior. A successful browser response must not
claim that a confirmation or password-reset email was actually sent.

## Scope

This change covers only the two success messages shown by the account modal:

- password-recovery requests;
- email/password registration requests.

It does not add a server-side email-existence check, change Supabase Auth
configuration, alter delivery providers, or handle the `user_already_exists`
error that is not enabled in the current hosted configuration.

## Decision

Keep the existing native Supabase browser calls and their generic success
responses. Replace the two unconditional delivery claims with conditional,
localized copy:

| Flow | Chinese | English |
| --- | --- | --- |
| Password recovery | 如果该邮箱已注册，你将收到密码重置邮件。 | If an account exists for this email, you’ll receive a password reset email. |
| Registration | 如果该邮箱尚未完成注册确认，你将收到确认邮件。 | If this email still needs confirmation, you’ll receive a confirmation email. |

This preserves the account-enumeration boundary: an address that is not
registered, an already-confirmed address submitted again, and an eligible
address all receive a non-disclosing success message. Actual Supabase errors,
such as rate limiting or invalid input, continue through the existing localized
error path instead of showing either success message.

## Components and Data Flow

`AccountModal` continues to call `signUpWithPassword` and
`resetPasswordForEmail` through `auth-service`. When either promise resolves,
it shows the corresponding i18n string and returns the modal to sign-in mode.
No request shape, service behavior, or Supabase template changes are needed.

## Testing

- Update account-modal tests to assert each conditional success message after
  the relevant mocked service resolves.
- Assert the service calls and the existing error behavior remain unchanged.
- Retain the auth-service tests that verify native Supabase sign-up and
  password-recovery requests.

## Out of Scope

- Determining whether an email address is registered or confirmed.
- Changing sign-in error semantics.
- Handling explicit duplicate-registration errors from configurations that
  enable them.
- Changing transactional-email delivery, templates, or hosted Supabase
  settings.
