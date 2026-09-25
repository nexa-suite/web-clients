import { HttpHeaders } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NexaAccessTokenStore } from './access-token.store';
import { afterEach, describe, expect, it } from 'vitest';
import { provideNexaHttp } from './nexa-http';
import { NexaHttpClient } from './nexa-http-client';

describe('NexaHttpClient', () => {
  let http: HttpTestingController;
  let client: NexaHttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNexaHttp({ apiBaseUrl: '/api/v1', surface: 'PORTAL' }), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(NexaHttpClient);
  });

  afterEach(() => http.verify());

  it('keeps typed consumers on the configured API transport and encodes query values', async () => {
    const response = client.get<{ items: string[] }>('/catalog-items', { query: { q: 'dairy & cheese', page: 1, optional: null } });
    const request = http.expectOne('/api/v1/catalog-items?q=dairy%20%26%20cheese&page=1');
    expect(request.request.method).toBe('GET');
    request.flush({ items: ['buyer-visible'] });
    await expect(response).resolves.toEqual({ items: ['buyer-visible'] });
  });

  it('rejects absolute URLs so callers cannot bypass the configured transport', () => {
    expect(() => client.get('https://example.invalid/data')).toThrow('Nexa API requests must use an API-relative path.');
  });

  it('rejects traversal and inline query strings', () => {
    expect(() => client.get('/catalog-items/../session')).toThrow('Nexa API requests must use an API-relative path.');
    expect(() => client.get('/catalog-items?q=unstructured')).toThrow('Nexa API requests must use an API-relative path.');
  });

  it('sends typed PUT updates through the same bearer-aware transport', async () => {
    TestBed.inject(NexaAccessTokenStore).set('test-token');

    const response = client.put<{ updated: boolean }>('/buyer/purchase-request-drafts/DRAFT-1/lines', { items: [] });
    const request = http.expectOne('/api/v1/buyer/purchase-request-drafts/DRAFT-1/lines');
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    expect(request.request.body).toEqual({ items: [] });
    request.flush({ updated: true });
    await expect(response).resolves.toEqual({ updated: true });
  });

  it('passes conditional and idempotency headers and exposes response ETags', async () => {
    const response = client.putResponse<{ updated: boolean }>(
      '/buyer/purchase-request-drafts/DRAFT-1',
      { note: 'updated' },
      {
        headers: { 'If-Match': '"revision-4"', 'Idempotency-Key': 'request-4' },
        correlationId: 'correlation-4',
      },
    );
    const request = http.expectOne('/api/v1/buyer/purchase-request-drafts/DRAFT-1');
    expect(request.request.headers.get('If-Match')).toBe('"revision-4"');
    expect(request.request.headers.get('Idempotency-Key')).toBe('request-4');
    expect(request.request.headers.get('X-Correlation-ID')).toBe('correlation-4');
    request.flush(
      { updated: true },
      { headers: new HttpHeaders({ ETag: '"revision-5"', 'X-Correlation-ID': 'correlation-4' }) },
    );

    const result = await response;
    expect(result.body).toEqual({ updated: true });
    expect(result.headers.get('ETag')).toBe('"revision-5"');
  });
});
