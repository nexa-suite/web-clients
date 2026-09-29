import { NexaApiError } from '@nexa/api';

export function platformOperationsApiErrorMessage(error: unknown): string {
  if (!(error instanceof NexaApiError)) {
    return 'The operational overview could not be loaded. Try again.';
  }

  switch (error.kind) {
    case 'network':
    case 'timeout':
      return 'The API could not be reached. Check the connection and try again.';
    case 'forbidden':
      return 'This operational overview is not available for the current business context.';
    case 'not-found':
      return 'The operational overview is not available.';
    default:
      return 'The operational overview could not be loaded. Try again.';
  }
}
