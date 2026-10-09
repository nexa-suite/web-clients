import { NexaApiError } from '@nexa/api';

export const INVALID_RESET_LINK_MESSAGE = 'The reset link is invalid or no longer available.';

export function passwordResetApiErrorMessage(error: unknown): string {
  if (!(error instanceof NexaApiError)) {
    return 'Your password could not be updated. Try again later.';
  }

  if (error.kind === 'network' || error.kind === 'timeout') {
    return 'The API could not be reached. Check your connection and try again.';
  }

  if (error.kind === 'validation'
    || error.kind === 'not-found'
    || error.kind === 'unauthenticated'
    || error.kind === 'forbidden'
    || error.kind === 'conflict') {
    return INVALID_RESET_LINK_MESSAGE;
  }

  return 'Your password could not be updated. Try again later.';
}
