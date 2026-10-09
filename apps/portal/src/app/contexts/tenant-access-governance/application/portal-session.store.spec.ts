import { TestBed } from "@angular/core/testing";
import {
  NexaAccessTokenStore,
  NexaApiError,
  NexaAuthenticationApi,
} from "@nexa/api";
import type { SessionResponse } from "@nexa/api";
import { firstValueFrom, of, Subject, throwError } from "rxjs";
import { PortalSessionStore } from "./portal-session.store";

describe("PortalSessionStore", () => {
  let api: {
    previewWorkspace: ReturnType<typeof vi.fn>;
    signIn: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    getCurrentSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  let tokens: NexaAccessTokenStore;
  let store: PortalSessionStore;

  const session: SessionResponse = {
    user: { userId: "user-1", displayName: "Buyer User" },
    tenant: { tenantId: "tenant-1", tenantSlug: "supplier" },
    workspace: { workspaceId: "workspace-1", workspaceSlug: "buyer-workspace" },
    membership: {
      membershipId: "membership-1",
      roles: ["WORKSPACE_ADMIN"],
      permissions: [],
    },
    surface: "PORTAL",
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
        PortalSessionStore,
        { provide: NexaAuthenticationApi, useValue: api },
      ],
    });
    store = TestBed.inject(PortalSessionStore);
    tokens = TestBed.inject(NexaAccessTokenStore);
  });

  it("restores the cookie session and publishes a usable lease with the authenticated state", async () => {
    api.refresh.mockReturnValue(of({ accessToken: "restored-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    let leaseAtEmission: ReturnType<PortalSessionStore["captureSessionLease"]> =
      null;
    const request = store.restoreSession();
    request.subscribe((state) => {
      if (state.status === "authenticated")
        leaseAtEmission = store.captureSessionLease();
    });

    const result = await firstValueFrom(request);

    expect(result).toEqual({ status: "authenticated", session });
    expect(api.refresh).toHaveBeenCalledOnce();
    expect(api.getCurrentSession).toHaveBeenCalledOnce();
    expect(tokens.read()).toBe("restored-token");
    expect(leaseAtEmission).toEqual({
      epoch: expect.any(Number),
      scope: {
        userId: "user-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        surface: "PORTAL",
      },
    });
  });

  it("serializes sign-in behind an in-flight refresh cookie mutation", async () => {
    const refresh = new Subject<{ accessToken: string }>();
    api.refresh.mockReturnValue(refresh);
    api.getCurrentSession.mockReturnValue(of(session));
    const restoration = firstValueFrom(store.restoreSession());

    await expect(
      firstValueFrom(
        store.signIn({
          identifier: "buyer@example.test",
          password: "unit-test-only",
          workspaceSlug: "buyer-workspace",
        }),
      ),
    ).rejects.toThrow("already in progress");

    expect(api.signIn).not.toHaveBeenCalled();
    expect(api.refresh).toHaveBeenCalledOnce();
    expect(store.state().status).toBe("loading");

    refresh.next({ accessToken: "restored-token" });
    refresh.complete();
    await restoration;
    expect(tokens.read()).toBe("restored-token");
  });

  it("forces the Portal surface and rejects an incomplete server session", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of({ surface: "PORTAL" }));

    await expect(
      firstValueFrom(
        store.signIn({
          identifier: "buyer@example.test",
          password: "unit-test-only",
          workspaceSlug: "buyer-workspace",
        }),
      ),
    ).rejects.toThrow("complete Portal access context");

    expect(api.signIn).toHaveBeenCalledWith({
      identifier: "buyer@example.test",
      password: "unit-test-only",
      workspaceSlug: "buyer-workspace",
      surface: "PORTAL",
    });
    expect(store.state().status).toBe("error");
    expect(store.captureSessionLease()).toBeNull();
    expect(tokens.read()).toBeNull();
  });

  it("invalidates only the matching current session lease", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "buyer@example.test",
        password: "unit-test-only",
        workspaceSlug: "buyer-workspace",
      }),
    );
    const lease = store.captureSessionLease()!;

    expect(store.invalidateContextIfCurrent(lease)).toBe(true);
    expect(store.state()).toEqual({ status: "invalidated" });
    expect(store.captureSessionLease()).toBeNull();
    expect(tokens.read()).toBeNull();
  });

  it("clears the session when sign-out reports an invalid server context", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "buyer@example.test",
        password: "unit-test-only",
        workspaceSlug: "buyer-workspace",
      }),
    );
    api.signOut.mockReturnValue(
      throwError(
        () =>
          new NexaApiError("forbidden", 403, {
            code: "ACCESS_CONTEXT_INVALID",
          }),
      ),
    );

    await expect(firstValueFrom(store.signOut())).resolves.toBeUndefined();

    expect(store.state()).toEqual({ status: "invalidated" });
    expect(store.captureSessionLease()).toBeNull();
    expect(tokens.read()).toBeNull();
  });

  it("preserves the valid session and token when sign-out cannot be confirmed", async () => {
    api.signIn.mockReturnValue(of({ accessToken: "signed-in-token" }));
    api.getCurrentSession.mockReturnValue(of(session));
    await firstValueFrom(
      store.signIn({
        identifier: "buyer@example.test",
        password: "unit-test-only",
        workspaceSlug: "buyer-workspace",
      }),
    );
    const oldLease = store.captureSessionLease()!;
    api.signOut.mockReturnValue(
      throwError(() => new NexaApiError("network", 0, null)),
    );

    await expect(firstValueFrom(store.signOut())).rejects.toMatchObject({
      kind: "network",
    });

    expect(store.state()).toEqual({ status: "authenticated", session });
    expect(store.captureSessionLease()).not.toEqual(oldLease);
    expect(tokens.read()).toBe("signed-in-token");
    expect(store.signOutError()).toContain("could not be confirmed");
  });
});
