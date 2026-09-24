import { NexaApiError } from '@nexa/api';

export type PlatformApiAction = 'preview' | 'sign-in' | 'session' | 'sign-out';

export function platformApiErrorMessage(error: unknown, action: PlatformApiAction): string {
  if (!(error instanceof NexaApiError)) {
    return action === 'sign-out'
      ? 'Sign out could not be completed. Try again.'
      : 'The request could not be completed. Try again.';
  }

  if (error.kind === 'network' || error.kind === 'timeout') {
    return action === 'sign-out'
      ? 'The API could not be reached, so your session is still active.'
      : 'The API could not be reached. Check the connection and try again.';
  }

  switch (action) {
    case 'preview':
      return error.kind === 'rate-limited'
        ? 'Too many workspace preview attempts. Wait before trying again.'
        : 'The workspace preview could not be completed. Check the workspace slug and try again.';
    case 'sign-in':
      return error.kind === 'unauthenticated'
        ? 'We could not verify those credentials. Check the identifier and password and try again.'
        : error.kind === 'forbidden'
          ? 'This browser is not allowed to start a session.'
          : 'Sign in could not be completed. Try again later.';
    case 'session':
      return 'The current session could not be restored. Sign in to continue.';
    case 'sign-out':
      return 'Sign out could not be completed. Your current session remains active.';
  }
}
