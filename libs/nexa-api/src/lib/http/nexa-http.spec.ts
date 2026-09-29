import { HttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NexaAccessTokenStore } from './access-token.store';
import { provideNexaHttp } from './nexa-http';

describe('provideNexaHttp', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: '/api/v1', surface: 'PORTAL' }),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('keeps the bearer off refresh while adding its surface marker and browser cookie transport', () => {
    TestBed.inject(NexaAccessTokenStore).set('memory-only-token');

    http.post('/api/v1/authentication/refresh', null).subscribe();

    const request = controller.expectOne('/api/v1/authentication/refresh');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.get('X-Nexa-Surface')).toBe('PORTAL');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ accessToken: 'rotated-token' });
  });

  it('keeps the bearer off sign-in while using browser cookie transport', () => {
    TestBed.inject(NexaAccessTokenStore).set('memory-only-token');

    http.post('/api/v1/authentication/sign-in', {
      identifier: 'person@example.invalid',
      password: 'not-a-real-password',
      workspaceSlug: 'workspace',
      surface: 'PORTAL',
    }).subscribe();

    const request = controller.expectOne('/api/v1/authentication/sign-in');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('X-Nexa-Surface')).toBe(false);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ accessToken: 'new-token' });
  });

  it('attaches the bearer to session and sign-out API requests', () => {
    TestBed.inject(NexaAccessTokenStore).set('memory-only-token');

    http.get('/api/v1/session').subscribe();

    const session = controller.expectOne('/api/v1/session');
    expect(session.request.headers.get('Authorization')).toBe('Bearer memory-only-token');
    expect(session.request.withCredentials).toBe(false);
    session.flush({});

    http.post('/api/v1/authentication/sign-out', null).subscribe();

    const signOut = controller.expectOne('/api/v1/authentication/sign-out');
    expect(signOut.request.headers.get('Authorization')).toBe('Bearer memory-only-token');
    expect(signOut.request.headers.get('X-Nexa-Surface')).toBe('PORTAL');
    expect(signOut.request.withCredentials).toBe(true);
    signOut.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('does not decorate a request outside the configured API base', () => {
    TestBed.inject(NexaAccessTokenStore).set('memory-only-token');

    http.get('https://example.invalid/resource').subscribe();

    const request = controller.expectOne('https://example.invalid/resource');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('X-Nexa-Surface')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    request.flush({});
  });
});
