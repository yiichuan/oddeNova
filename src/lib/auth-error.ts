const AUTH_ERROR_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  invalid_credentials: 'authErrorInvalidCredentials',
  email_not_confirmed: 'authErrorEmailNotConfirmed',
  user_already_exists: 'authErrorUserAlreadyExists',
  email_exists: 'authErrorUserAlreadyExists',
  weak_password: 'authErrorWeakPassword',
  email_address_invalid: 'authErrorInvalidEmail',
  over_email_send_rate_limit: 'authErrorRateLimited',
  over_request_rate_limit: 'authErrorRateLimited',
  signup_disabled: 'authErrorSignupDisabled',
  email_provider_disabled: 'authErrorSignupDisabled',
  same_password: 'authErrorSamePassword',
  reauthentication_needed: 'authErrorSessionExpired',
  reauthentication_not_valid: 'authErrorSessionExpired',
  session_not_found: 'authErrorSessionExpired',
  refresh_token_not_found: 'authErrorSessionExpired',
  refresh_token_already_used: 'authErrorSessionExpired',
};

interface AuthErrorLike {
  code?: unknown;
  name?: unknown;
}

export function getAuthErrorMessageKey(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, name } = error as AuthErrorLike;
    if (typeof code === 'string' && AUTH_ERROR_MESSAGE_KEYS[code]) {
      return AUTH_ERROR_MESSAGE_KEYS[code];
    }
    if (name === 'AuthRetryableFetchError') {
      return 'authErrorNetwork';
    }
  }

  if (error instanceof TypeError) {
    return 'authErrorNetwork';
  }

  return 'accountActionFailed';
}
