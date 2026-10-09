import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NexaAccessTokenStore } from '../../../http/access-token.store';
import { provideNexaHttp } from '../../../http/nexa-http';
import { NexaAuthenticationApi } from './authentication-api';

describe('NexaAuthenticationApi', () => {
  let api: NexaAuthenticationApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({
          apiBaseUrl: 'http://localhost:8080/api/v1',
          surface: 'PLATFORM',
        }),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(NexaAuthenticationApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('previews the requested workspace using the supported API contract', () => {
    TestBed.inject(NexaAccessTokenStore).set('previous-memory-token');

    api.previewWorkspace({ workspaceSlug: 'acme-west' }).subscribe();

    const request = controller.expectOne(
      'http://localhost:8080/api/v1/auth/workspace-previews',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ workspaceSlug: 'acme-west' });
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    request.flush({
      recognized: true,
      displayName: 'Acme West',
      loginAvailable: true,
    });
  });

  it('requests recovery with the internal surface and keeps the response generic', () => {
    api.requestPasswordReset({
      email: 'owner@example.test',
      surface: 'PLATFORM',
    }).subscribe();

    const request = controller.expectOne(
      'http://localhost:8080/api/v1/auth/password-reset-requests',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      email: 'owner@example.test',
      surface: 'PLATFORM',
    });
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    request.flush({ message: 'If the account can receive a reset, instructions will be delivered.' });
  });

  it('submits a reset token without adding a bearer or browser session credential', () => {
    TestBed.inject(NexaAccessTokenStore).set('previous-memory-token');

    api.resetPassword({ token: 'opaque-test-token', newPassword: 'safe-password-value' }).subscribe();

    const request = controller.expectOne(
      'http://localhost:8080/api/v1/auth/password-resets',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      token: 'opaque-test-token',
      newPassword: 'safe-password-value',
    });
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    request.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('sends sign-in with the caller supplied surface and no bearer token', () => {
    TestBed.inject(NexaAccessTokenStore).set('previous-memory-token');

    api
      .signIn({
        identifier: 'operator@example.test',
        password: 'not-a-real-password',
        workspaceSlug: 'acme-west',
        surface: 'PLATFORM',
      })
      .subscribe();

    const request = controller.expectOne(
      'http://localhost:8080/api/v1/authentication/sign-in',
    );
    expect(request.request.body).toEqual({
      identifier: 'operator@example.test',
      password: 'not-a-real-password',
      workspaceSlug: 'acme-west',
      surface: 'PLATFORM',
    });
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('X-Nexa-Surface')).toBe(false);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ accessToken: 'new-memory-token' });
  });

  it('refreshes with the surface cookie, no bearer, and no native refresh header', () => {
    TestBed.inject(NexaAccessTokenStore).set('previous-memory-token');

    api.refresh().subscribe();

    const request = controller.expectOne(
      'http://localhost:8080/api/v1/authentication/refresh',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get('X-Nexa-Surface')).toBe('PLATFORM');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('X-Nexa-Refresh-Token')).toBe(false);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ accessToken: 'rotated-memory-token' });
  });

  it('gets the server session with the current in-memory bearer token', () => {
    TestBed.inject(NexaAccessTokenStore).set('memory-only-token');

    api.getCurrentSession().subscribe();

    const request = controller.expectOne(
      'http://localhost:8080/api/v1/session',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer memory-only-token',
    );
    request.flush({
      user: { userId: 'user-1' },
      tenant: { tenantSlug: 'acme' },
      workspace: { workspaceSlug: 'acme-west' },
      membership: { roles: ['TENANT_ADMIN'], permissions: ['iam.user.read'] },
      surface: 'PLATFORM',
    });
  });

  it('signs out through the browser cookie contract and authenticated bearer', () => {
    TestBed.inject(NexaAccessTokenStore).set('memory-only-token');

    api.signOut().subscribe();

    const request = controller.expectOne(
      'http://localhost:8080/api/v1/authentication/sign-out',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer memory-only-token',
    );
    expect(request.request.headers.get('X-Nexa-Surface')).toBe('PLATFORM');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null, { status: 204, statusText: 'No Content' });
  });
  it('lists eligible browser contexts with bearer and surface, without native ticket authority', () => {
    TestBed.inject(NexaAccessTokenStore).set('current-memory-token');
    api.listAccessContexts().subscribe();
    const request = controller.expectOne('http://localhost:8080/api/v1/me/access-contexts');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer current-memory-token');
    expect(request.request.headers.get('X-Nexa-Surface')).toBe('PLATFORM');
    expect(request.request.headers.has('X-Nexa-Context-Ticket')).toBe(false);
    expect(request.request.headers.has('X-Nexa-Client')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    request.flush({ accessContexts: [] });
  });

  it('selects browser context with bearer, surface and cookie rotation transport', () => {
    TestBed.inject(NexaAccessTokenStore).set('current-memory-token');
    api.selectAccessContext({ membershipId: 'membership-2' }).subscribe();
    const request = controller.expectOne('http://localhost:8080/api/v1/me/access-context-selections');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ membershipId: 'membership-2' });
    expect(request.request.headers.get('Authorization')).toBe('Bearer current-memory-token');
    expect(request.request.headers.get('X-Nexa-Surface')).toBe('PLATFORM');
    expect(request.request.headers.has('X-Nexa-Context-Ticket')).toBe(false);
    expect(request.request.headers.has('X-Nexa-Client')).toBe(false);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ accessToken: 'selected-memory-token' });
  });

});
