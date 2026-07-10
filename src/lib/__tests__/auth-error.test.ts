import { describe, expect, it } from 'vitest';
import { getAuthErrorMessageKey } from '../auth-error';

describe('getAuthErrorMessageKey', () => {
  it.each([
    ['invalid_credentials', 'authErrorInvalidCredentials'],
    ['email_not_confirmed', 'authErrorEmailNotConfirmed'],
    ['user_already_exists', 'authErrorUserAlreadyExists'],
    ['email_exists', 'authErrorUserAlreadyExists'],
    ['weak_password', 'authErrorWeakPassword'],
    ['email_address_invalid', 'authErrorInvalidEmail'],
    ['over_email_send_rate_limit', 'authErrorRateLimited'],
    ['over_request_rate_limit', 'authErrorRateLimited'],
    ['signup_disabled', 'authErrorSignupDisabled'],
    ['email_provider_disabled', 'authErrorSignupDisabled'],
    ['same_password', 'authErrorSamePassword'],
    ['reauthentication_needed', 'authErrorSessionExpired'],
    ['reauthentication_not_valid', 'authErrorSessionExpired'],
    ['session_not_found', 'authErrorSessionExpired'],
    ['refresh_token_not_found', 'authErrorSessionExpired'],
    ['refresh_token_already_used', 'authErrorSessionExpired'],
  ])('maps Supabase code %s to %s', (code, expectedKey) => {
    expect(getAuthErrorMessageKey({ code })).toBe(expectedKey);
  });

  it.each([
    { name: 'AuthRetryableFetchError' },
    new TypeError('Failed to fetch'),
  ])('maps network failures to a retryable message', (error) => {
    expect(getAuthErrorMessageKey(error)).toBe('authErrorNetwork');
  });

  it.each([
    new Error('Invalid login credentials'),
    { code: 'future_supabase_error', message: 'Sensitive backend detail' },
    null,
  ])('uses a generic message for unknown errors', (error) => {
    expect(getAuthErrorMessageKey(error)).toBe('accountActionFailed');
  });
});
