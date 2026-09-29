import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { mapNexaApiError } from './api-error';

describe('mapNexaApiError', () => {
  it('maps API Problem Details and Retry-After headers', () => {
    const error = mapNexaApiError(
      new HttpErrorResponse({
        status: 429,
        error: {
          title: 'Rate limit reached',
          status: 429,
          detail: 'Try again later.',
          code: 'RATE_LIMITED',
          correlationId: 'correlation-1',
          category: 'RATE_LIMIT',
          retryable: true,
        },
        headers: new HttpHeaders({ 'Retry-After': '45' }),
      }),
    );

    expect(error.kind).toBe('rate-limited');
    expect(error.status).toBe(429);
    expect(error.problem?.correlationId).toBe('correlation-1');
    expect(error.retryAfterSeconds).toBe(45);
  });

  it('distinguishes network and timeout failures', () => {
    const networkError = mapNexaApiError(new HttpErrorResponse({ status: 0 }));
    const timeoutError = mapNexaApiError(new TimeoutError());

    expect(networkError.kind).toBe('network');
    expect(timeoutError.kind).toBe('timeout');
  });

  it('maps stable HTTP status categories', () => {
    const unauthorized = mapNexaApiError(new HttpErrorResponse({ status: 401 }));
    const conflict = mapNexaApiError(new HttpErrorResponse({ status: 409 }));
    const precondition = mapNexaApiError(new HttpErrorResponse({ status: 412 }));
    const server = mapNexaApiError(new HttpErrorResponse({ status: 503 }));

    expect(unauthorized.kind).toBe('unauthenticated');
    expect(conflict.kind).toBe('conflict');
    expect(precondition.kind).toBe('precondition');
    expect(server.kind).toBe('server');
  });
});
