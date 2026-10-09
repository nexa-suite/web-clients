import { TestBed } from "@angular/core/testing";
import { firstValueFrom, Observable, of, Subject, throwError } from "rxjs";
import type {
  AccessContextResponse,
  SessionResponse,
  SignInRequest,
} from "@nexa/api";
import {
  NexaApiError,
  NexaAuthenticationApi,
  NexaAccessTokenStore,
} from "@nexa/api";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "./platform-session.store";

describe("PlatformSessionStore", () => {
  let api: {
    previewWorkspace: ReturnType<typeof vi.fn>;
    signIn: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    getCurrentSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    listAccessContexts: ReturnType<typeof vi.fn>;
    selectAccessContext: ReturnType<typeof vi.fn>;
  };
  let accessTokens: NexaAccessTokenStore;
  let store: PlatformSessionStore;

  const session: SessionResponse = {
    user: { userId: "user-1", displayName: "Owner" },
    tenant: { tenantId: "tenant-1", tenantSlug: "tenant" },
    workspace: { workspaceId: "workspace-1", workspaceSlug: "main" },
    membership: {
      membershipId: "membership-1",
      roles: ["COMPANY_OWNER"],
      permissions: ["tenant.read"],
    },
    surface: "PLATFORM",
  };

  beforeEach(() => {
    api = {
      previewWorkspace: vi.fn(),
      signIn: vi.fn(),
      refresh: vi.fn(),
      getCurrentSession: vi.fn(),
      signOut: vi.fn(),
      listAccessContexts: vi.fn(),
      selectAccessContext: vi.fn(),
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

  it("restores one cookie-backed session request and loads the server context", async () => {
    api.refresh.mockReturnValue(of({ accessToken: "restored-token" }));
    api.getCurrentSession.mockReturnValue(of(session));

    const first = store.restoreSession();
    const second = store.restoreSession();
    let leaseWhenRestoreEmits: PlatformSessionLease | null = null;
    first.subscribe((state) => {
      if (state.status === "authenticated") {
        leaseWhenRestoreEmits = store.captureSessionLease();
      }
    });
    const states = await Promise.all([
      firstValueFrom(first),
      firstValueFrom(second),
    ]);

    expect(api.refresh).toHaveBeenCalledOnce();
    expect(api.getCurrentSession).toHaveBeenCalledOnce();
    expect(states).toEqual([
      { status: "authenticated", session },
      { status: "authenticated", session },
    ]);
    expect(accessTokens.read()).toBe("restored-token");
    expect(leaseWhenRestoreEmits).not.toBeNull();
  });

  it("serializes browser mutations behind an in-flight cookie refresh", async () => {
    const pendingRefresh = new Subject<{ accessToken: string }>();
    api.refresh.mockReturnValue(pendingRefresh);
    api.getCurrentSession.mockReturnValue(of(session));

    const restoration = store.restoreSession();
    const restorationResult = firstValueFrom(restoration);
    await expect(
      firstValueFrom(
        store.signIn({
          identifier: "owner",
          password: "unit-test-only",
          workspaceSlug: "main",
        }),
      ),
    ).rejects.toThrow("already in progress");
    await expect(firstValueFrom(store.signOut())).rejects.toThrow(
      "already in progress",
    );
    await expect(
      firstValueFrom(store.selectAccessContext("membership-2")),
    ).rejects.toThrow("already in progress");

    expect(api.refresh).toHaveBeenCalledOnce();
    expect(api.signIn).not.toHaveBeenCalled();
    expect(api.signOut).not.toHaveBeenCalled();
    expect(api.selectAccessContext).not.toHaveBeenCalled();
    expect(store.state().status).toBe("loading");

    pendingRefresh.next({ accessToken: "restored-token" });
    pendingRefresh.complete();
    expect(await restorationResult).toEqual({
      status: "authenticated",
      session,
    });
    expect(accessTokens.read()).toBe("restored-token");

    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    expect(api.signIn).toHaveBeenCalledOnce();
    expect(accessTokens.read()).toBe("signed-in-token");
  });

  it("starts Platform sign-in and loads the returned server session", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    const credentials = {
      identifier: "owner@example.test",
      password: "unit-test-only",
      workspaceSlug: "main",
    };

    const signIn = store.signIn(credentials);
    let leaseWhenSignInEmits: PlatformSessionLease | null = null;
    signIn.subscribe(() => {
      leaseWhenSignInEmits = store.captureSessionLease();
    });
    const result = await firstValueFrom(signIn);

    expect(api.signIn).toHaveBeenCalledWith({
      ...credentials,
      surface: "PLATFORM",
    } satisfies SignInRequest);
    expect(result).toEqual(session);
    expect(store.state()).toEqual({ status: "authenticated", session });
    expect(accessTokens.read()).toBe("signed-in-token");
    expect(leaseWhenSignInEmits).not.toBeNull();
  });

  it("fails closed when the API session does not provide complete Platform scope", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of({ surface: "PLATFORM" }));

    await expect(
      firstValueFrom(
        store.signIn({
          identifier: "owner",
          password: "unit-test-only",
          workspaceSlug: "main",
        }),
      ),
    ).rejects.toThrow("complete Platform access context");

    expect(store.captureSessionLease()).toBeNull();
    expect(store.state()).toEqual({ status: "unauthenticated" });
    expect(accessTokens.read()).toBeNull();
  });

  it("lists current server access contexts only while the captured session lease remains current", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    const contexts: readonly AccessContextResponse[] = [
      {
        membershipId: "membership-2",
        tenantId: "tenant-2",
        tenantName: "Tenant Two",
        tenantSlug: "tenant-two",
        workspaceId: "workspace-2",
        workspaceName: "Workspace Two",
        workspaceSlug: "workspace-two",
      },
    ];
    api.listAccessContexts.mockReturnValue(of({ accessContexts: contexts }));

    const result = await firstValueFrom(store.listAccessContexts());

    expect(api.listAccessContexts).toHaveBeenCalledOnce();
    expect(result).toEqual(contexts);
  });

  it("keeps the current bearer through context selection, then publishes a new session epoch and scope", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "session-a-token" }));
    api.getCurrentSession.mockReturnValueOnce(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    const leaseA = store.captureSessionLease();
    expect(leaseA).not.toBeNull();

    const sessionB: SessionResponse = {
      user: { userId: "user-1", displayName: "Owner" },
      tenant: { tenantId: "tenant-2", tenantSlug: "tenant-two" },
      workspace: { workspaceId: "workspace-2", workspaceSlug: "workspace-two" },
      membership: {
        membershipId: "membership-2",
        roles: ["COMPANY_OWNER"],
        permissions: ["tenant.read"],
      },
      surface: "PLATFORM",
    };
    let tokenAtDispatch: string | null = null;
    api.selectAccessContext.mockImplementation(
      () =>
        new Observable((subscriber) => {
          tokenAtDispatch = accessTokens.read();
          subscriber.next({ accessToken: "session-b-token" });
          subscriber.complete();
        }),
    );
    api.getCurrentSession.mockReturnValueOnce(of(sessionB));

    const selection = store.selectAccessContext("membership-2");
    let leaseWhenSelectionEmits: PlatformSessionLease | null = null;
    selection.subscribe(() => {
      leaseWhenSelectionEmits = store.captureSessionLease();
    });
    const result = await firstValueFrom(selection);
    const leaseB = store.captureSessionLease();

    expect(api.selectAccessContext).toHaveBeenCalledWith({
      membershipId: "membership-2",
    });
    expect(tokenAtDispatch).toBe("session-a-token");
    expect(result).toEqual(sessionB);
    expect(leaseB?.scope).toEqual({
      userId: "user-1",
      tenantId: "tenant-2",
      workspaceId: "workspace-2",
      membershipId: "membership-2",
      surface: "PLATFORM",
    });
    expect(typeof leaseB?.epoch).toBe("number");
    expect(leaseB?.epoch).not.toBe(leaseA?.epoch);
    expect(leaseWhenSelectionEmits).not.toBeNull();
    expect(store.isSessionLeaseCurrent(leaseA!)).toBe(false);
    expect(accessTokens.read()).toBe("session-b-token");
  });

  it("restores the current session after a definitive rejected selection", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "session-a-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    const leaseA = store.captureSessionLease();
    api.selectAccessContext.mockReturnValue(
      throwError(
        () =>
          new NexaApiError("conflict", 409, {
            code: "ACCESS_CONTEXT_SELECTION_REJECTED",
          }),
      ),
    );
    const selection = store.selectAccessContext("unknown-membership");

    await expect(firstValueFrom(selection)).rejects.toMatchObject({
      kind: "conflict",
    });
    await expect(firstValueFrom(selection)).rejects.toMatchObject({
      kind: "conflict",
    });

    expect(api.selectAccessContext).toHaveBeenCalledOnce();
    expect(store.state()).toEqual({ status: "authenticated", session });
    expect(accessTokens.read()).toBe("session-a-token");
    expect(store.captureSessionLease()?.epoch).not.toBe(leaseA?.epoch);
  });

  it("does not restore a previous context after a request timeout", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "session-a-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    api.selectAccessContext.mockReturnValue(
      throwError(
        () => new NexaApiError("http", 408, { code: "REQUEST_TIMEOUT" }),
      ),
    );

    await expect(
      firstValueFrom(store.selectAccessContext("membership-2")),
    ).rejects.toMatchObject({ status: 408 });

    expect(store.state().status).toBe("error");
    expect(accessTokens.read()).toBeNull();
    expect(store.captureSessionLease()).toBeNull();
  });

  it("rejects a selection response whose loaded session is not the requested membership", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "session-a-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    api.selectAccessContext.mockReturnValue(
      of({ accessToken: "session-b-token" }),
    );
    api.getCurrentSession.mockReturnValue(of(session));

    await expect(
      firstValueFrom(store.selectAccessContext("membership-2")),
    ).rejects.toThrow("different access context than the one selected");

    expect(store.state().status).toBe("error");
    expect(accessTokens.read()).toBeNull();
  });

  it("rejects malformed access-context data before returning it to presentation", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    api.listAccessContexts.mockReturnValue(of({ accessContexts: [null] }));

    await expect(firstValueFrom(store.listAccessContexts())).rejects.toThrow(
      "incomplete access-context list",
    );

    expect(store.state().status).toBe("authenticated");
    expect(accessTokens.read()).toBe("signed-in-token");
  });

  it("does not invalidate a newer session when an older response reports an invalid context", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "session-a-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    const leaseA = store.captureSessionLease();

    api.signIn.mockReturnValue(of({ accessToken: "session-b-token" }));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "other",
      }),
    );

    expect(store.invalidateContextIfCurrent(leaseA!)).toBe(false);
    expect(store.state().status).toBe("authenticated");
    expect(accessTokens.read()).toBe("session-b-token");
  });

  it("does not send overlapping session mutations", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    const pendingSignOut = new Subject<void>();
    api.signOut.mockReturnValue(pendingSignOut);
    const first = store.signOut();
    expect(store.state()).toEqual({ status: "authenticated", session });
    const subscription = first.subscribe();
    expect(store.state()).toEqual({ status: "signing-out", session });

    await expect(firstValueFrom(store.signOut())).rejects.toThrow(
      "already in progress",
    );
    expect(api.signOut).toHaveBeenCalledOnce();
    pendingSignOut.next();
    pendingSignOut.complete();
    await firstValueFrom(first);
    expect(store.state()).toEqual({ status: "unauthenticated" });
    subscription.unsubscribe();
  });

  it("clears local access state when refresh reports an unauthenticated session", async () => {
    accessTokens.set("expired-token");
    api.refresh.mockReturnValue(
      throwError(() => new NexaApiError("unauthenticated", 401, null)),
    );

    const result = await firstValueFrom(store.restoreSession());

    expect(result.status).toBe("unauthenticated");
    expect(accessTokens.read()).toBeNull();
  });

  it("clears local state and completes sign-out when the API says the session is already unauthenticated", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    api.signOut.mockReturnValue(
      throwError(() => new NexaApiError("unauthenticated", 401, null)),
    );

    await firstValueFrom(store.signOut());

    expect(store.state()).toEqual({ status: "unauthenticated" });
    expect(accessTokens.read()).toBeNull();
  });

  it("preserves an active local session after a transport failure during sign-out", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "owner",
        password: "unit-test-only",
        workspaceSlug: "main",
      }),
    );
    api.signOut.mockReturnValue(
      throwError(() => new NexaApiError("network", 0, null)),
    );

    await expect(firstValueFrom(store.signOut())).rejects.toMatchObject({
      kind: "network",
    });

    expect(store.state()).toEqual({ status: "authenticated", session });
    expect(accessTokens.read()).toBe("signed-in-token");
  });
});
