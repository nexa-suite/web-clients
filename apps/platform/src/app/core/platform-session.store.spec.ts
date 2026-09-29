import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import type { SessionResponse, SignInRequest } from '@nexa/api';
import { NexaApiError, NexaAuthenticationApi, NexaAccessTokenStore } from '@nexa/api';
import { PlatformSessionStore } from './platform-session.store';

describe('PlatformSessionStore', () => {
  let api: {
    previewWorkspace: ReturnType<typeof vi.fn>;
    signIn: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    getCurrentSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  let accessTokens: NexaAccessTokenStore;
  let store: PlatformSessionStore;

  const session: SessionResponse = {
    user: { userId: 'user-1', displayName: 'Owner' },
    tenant: { tenantId: 'tenant-1', tenantSlug: 'tenant' },
    workspace: { workspaceId: 'workspace-1', workspaceSlug: 'main' },
    membership: { membershipId: 'membership-1', roles: ['COMPANY_OWNER'], permissions: ['tenant.read'] },
    surface: 'PLATFORM',
  };

  beforeEach(() => {
    api = {
      previewWorkspace: vi.fn(),
      signIn: vi.fn(),
      refresh: vi.fn(),
      getCurrentSession: vi.fn(),
      signOut: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        PlatformSessionStore,
        { provide: NexaAuthenticationApi, useValue: api },
      ],
    });
    store = TestBed.inject(PlatformSessionStore);
    accessTokens = TestBed.inject(NexaAccessTokenStore);
  });

  it('restores one cookie-backed session request and loads the server context', async () => {
    api.refresh.mockReturnValue(of({ accessToken: 'restored-token' }));
    api.getCurrentSession.mockReturnValue(of(session));

    const first = store.restoreSession();
    const second = store.restoreSession();
    const states = await Promise.all([firstValueFrom(first), firstValueFrom(second)]);

    expect(api.refresh).toHaveBeenCalledOnce();
    expect(api.getCurrentSession).toHaveBeenCalledOnce();
    expect(states).toEqual([
      { status: 'authenticated', session },
      { status: 'authenticated', session },
    ]);
    expect(accessTokens.read()).toBe('restored-token');
  });

  it('starts Platform sign-in and loads the returned server session', async () => {
    api.signIn.mockReturnValue(of({ accessToken: 'signed-in-token' }));
    api.getCurrentSession.mockReturnValue(of(session));
    const credentials = {
      identifier: 'owner@example.test',
      password: 'unit-test-only',
      workspaceSlug: 'main',
    };

    const result = await firstValueFrom(store.signIn(credentials));

    expect(api.signIn).toHaveBeenCalledWith({ ...credentials, surface: 'PLATFORM' } satisfies SignInRequest);
    expect(result).toEqual(session);
    expect(store.state()).toEqual({ status: 'authenticated', session });
    expect(accessTokens.read()).toBe('signed-in-token');
  });

  it('clears local access state when refresh reports an unauthenticated session', async () => {
    accessTokens.set('expired-token');
    api.refresh.mockReturnValue(throwError(() => new NexaApiError('unauthenticated', 401, null)));

    const result = await firstValueFrom(store.restoreSession());

    expect(result.status).toBe('unauthenticated');
    expect(accessTokens.read()).toBeNull();
  });

  it('clears local state and completes sign-out when the API says the session is already unauthenticated', async () => {
    api.signIn.mockReturnValue(of({ accessToken: 'signed-in-token' }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(store.signIn({ identifier: 'owner', password: 'unit-test-only', workspaceSlug: 'main' }));
    api.signOut.mockReturnValue(throwError(() => new NexaApiError('unauthenticated', 401, null)));

    await firstValueFrom(store.signOut());

    expect(store.state()).toEqual({ status: 'unauthenticated' });
    expect(accessTokens.read()).toBeNull();
  });

  it('preserves an active local session after a transport failure during sign-out', async () => {
    api.signIn.mockReturnValue(of({ accessToken: 'signed-in-token' }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(store.signIn({ identifier: 'owner', password: 'unit-test-only', workspaceSlug: 'main' }));
    api.signOut.mockReturnValue(throwError(() => new NexaApiError('network', 0, null)));

    await expect(firstValueFrom(store.signOut())).rejects.toMatchObject({ kind: 'network' });

    expect(store.state()).toEqual({ status: 'authenticated', session });
    expect(accessTokens.read()).toBe('signed-in-token');
  });
});
