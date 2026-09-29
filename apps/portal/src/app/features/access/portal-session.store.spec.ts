import { TestBed } from '@angular/core/testing';
import { NexaAccessTokenStore, NexaApiError } from '@nexa/api';
import type { SessionResponse, SignInRequest } from '@nexa/api';
import { PortalAccessApiAdapter } from './access-api.adapter';
import { PortalSessionStore } from './portal-session.store';

describe('PortalSessionStore', () => {
  let store: PortalSessionStore;
  let tokens: NexaAccessTokenStore;
  let api: {
    refresh: ReturnType<typeof vi.fn>;
    signIn: ReturnType<typeof vi.fn>;
    session: ReturnType<typeof vi.fn>;
    buyerAccount: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      refresh: vi.fn().mockResolvedValue({ accessToken: 'refreshed-token' }),
      signIn: vi.fn(),
      session: vi.fn(),
      buyerAccount: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        PortalSessionStore,
        NexaAccessTokenStore,
        { provide: PortalAccessApiAdapter, useValue: api },
      ],
    });
    store = TestBed.inject(PortalSessionStore);
    tokens = TestBed.inject(NexaAccessTokenStore);
    tokens.set('in-memory-token');
  });

  it('authorizes from the matching server Buyer projection without interpreting workforce role names', async () => {
    api.session.mockResolvedValue({
      surface: 'PORTAL',
      membership: { membershipId: 'membership-1', roles: ['PLATFORM_ADMIN'] },
      user: { displayName: 'Buyer contact' },
    } satisfies SessionResponse);
    api.buyerAccount.mockResolvedValue({ buyerMembershipId: 'membership-1', businessName: 'Buyer account' });

    await expect(store.initialize()).resolves.toBe('authorized');

    expect(store.isBuyerAuthorized()).toBe(true);
    expect(store.buyerAccount()?.businessName).toBe('Buyer account');
  });

  it('requires a matching server Buyer relationship even when the workforce session has roles', async () => {
    api.session.mockResolvedValue({
      surface: 'PORTAL',
      membership: { membershipId: 'membership-1', roles: ['BUYER'] },
    } satisfies SessionResponse);
    api.buyerAccount.mockResolvedValue({ buyerMembershipId: 'different-membership' });

    await expect(store.initialize()).resolves.toBe('relationship-required');

    expect(store.isBuyerAuthorized()).toBe(false);
  });

  it('refreshes once after an expired access token and retries the server session', async () => {
    api.session
      .mockRejectedValueOnce(new NexaApiError('unauthenticated', 401, null))
      .mockResolvedValueOnce({ surface: 'PORTAL', membership: { membershipId: 'membership-1' } });
    api.buyerAccount.mockResolvedValue({ buyerMembershipId: 'membership-1' });

    await expect(store.initialize()).resolves.toBe('authorized');

    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(api.session).toHaveBeenCalledTimes(2);
    expect(tokens.read()).toBe('refreshed-token');
  });

  it('returns to anonymous when sign-out succeeds', async () => {
    await expect(store.signOut()).resolves.toBe(true);
    expect(store.state()).toBe('anonymous');
    expect(tokens.read()).toBeNull();
  });

  it('keeps an unconfirmed session visible when server sign-out fails', async () => {
    api.signOut.mockRejectedValue(new NexaApiError('network', 0, null));

    await expect(store.signOut()).resolves.toBe(false);

    expect(tokens.read()).toBe('in-memory-token');
    expect(store.signOutError()).toContain('could not be confirmed');
  });

  it('ignores a session response that arrives after sign-out', async () => {
    let resolveSession!: (session: SessionResponse) => void;
    const pendingSession = new Promise<SessionResponse>((resolve) => { resolveSession = resolve; });
    api.session.mockReturnValue(pendingSession);
    const initialization = store.initialize();

    await store.signOut();
    resolveSession({ surface: 'PORTAL', membership: { membershipId: 'membership-1' } });

    await expect(initialization).resolves.toBe('anonymous');
    expect(store.state()).toBe('anonymous');
    expect(tokens.read()).toBeNull();
    expect(api.buyerAccount).not.toHaveBeenCalled();
  });

  it('forces sign-in requests onto the Portal surface', async () => {
    api.signIn.mockResolvedValue({ accessToken: 'signed-in-token' });
    api.session.mockResolvedValue({ surface: 'PORTAL', membership: { membershipId: 'membership-1' } });
    api.buyerAccount.mockResolvedValue({ buyerMembershipId: 'membership-1' });
    const credentials: SignInRequest = {
      identifier: 'person@example.invalid',
      password: 'test-only-password',
      workspaceSlug: 'test-workspace',
      surface: 'PLATFORM',
    };

    await store.signIn(credentials);

    expect(api.signIn).toHaveBeenCalledWith({ ...credentials, surface: 'PORTAL' });
  });
});
