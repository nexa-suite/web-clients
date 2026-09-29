import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import {
  ApiProblemDetails,
  NexaProblemDetail,
  ProblemDetail,
} from '../contracts/authentication.contracts';

export type NexaApiErrorKind =
  | 'network'
  | 'timeout'
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'precondition'
  | 'rate-limited'
  | 'server'
  | 'http'
  | 'unknown';

export class NexaApiError extends Error {
  constructor(
    readonly kind: NexaApiErrorKind,
    readonly status: number | null,
    readonly problem: ApiProblemDetails | null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(problem?.detail || problem?.title || fallbackMessage(kind));
    this.name = 'NexaApiError';
  }
}

export function mapNexaApiError(cause: unknown): NexaApiError {
  if (cause instanceof NexaApiError) {
    return cause;
  }

  if (cause instanceof TimeoutError) {
    return new NexaApiError('timeout', null, null);
  }

  if (cause instanceof HttpErrorResponse) {
    if (cause.status === 0) {
      return new NexaApiError('network', 0, readProblem(cause.error));
    }

    const retryAfter = Number.parseInt(cause.headers.get('Retry-After') ?? '', 10);
    return new NexaApiError(
      kindForStatus(cause.status),
      cause.status,
      readProblem(cause.error),
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
    );
  }

  return new NexaApiError('unknown', null, null);
}

function kindForStatus(status: number): NexaApiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 412) return 'precondition';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  return 'http';
}

function readProblem(value: unknown): ApiProblemDetails | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const fields = [
    'type',
    'title',
    'status',
    'detail',
    'instance',
    'properties',
    'code',
    'correlationId',
    'category',
    'retryable',
    'traceId',
    'errors',
  ];
  const record = value as Record<string, unknown>;
  if (!fields.some((field) => field in record)) {
    return null;
  }

  return value as ApiProblemDetails;
}

function fallbackMessage(kind: NexaApiErrorKind): string {
  switch (kind) {
    case 'network':
      return 'The API could not be reached.';
    case 'timeout':
      return 'The API request timed out.';
    case 'validation':
      return 'The API rejected the request.';
    case 'unauthenticated':
      return 'Authentication is required.';
    case 'forbidden':
      return 'The API denied the request.';
    case 'not-found':
      return 'The requested API resource was not found.';
    case 'conflict':
      return 'The API request conflicts with current state.';
    case 'precondition':
      return 'The API request precondition was not met.';
    case 'rate-limited':
      return 'The API rate limit was reached.';
    case 'server':
      return 'The API could not complete the request.';
    case 'http':
      return 'The API returned an unsuccessful response.';
    case 'unknown':
      return 'An unexpected API error occurred.';
  }
}

export type SupportedProblemDetails = ProblemDetail | NexaProblemDetail;
