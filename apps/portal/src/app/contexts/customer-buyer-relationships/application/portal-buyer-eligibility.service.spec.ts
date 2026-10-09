import { TestBed } from "@angular/core/testing";
import {
  NexaAccessTokenStore,
  NexaApiError,
  NexaAuthenticationApi,
  NexaBuyerRelationshipsApi,
} from "@nexa/api";
import type { CurrentBuyerAccountResponse, SessionResponse } from "@nexa/api";
import { firstValueFrom, of, Subject, throwError } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { PortalBuyerEligibilityService } from "./portal-buyer-eligibility.service";

describe("PortalBuyerEligibilityService", () => {
  let authenticationApi: {
    signIn: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    getCurrentSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    previewWorkspace: ReturnType<typeof vi.fn>;
  };
  let buyerApi: { getCurrentAccount: ReturnType<typeof vi.fn> };
  let sessions: PortalSessionStore;
  let eligibility: PortalBuyerEligibilityService;
  let tokens: NexaAccessTokenStore;

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

  const account: CurrentBuyerAccountResponse = {
    id: "account-1",
    code: "BUYER-1",
    businessName: "Buyer Company",
    commercialName: "Buyer Company",
    countryCode: "PE",
    taxType: "RUC",
    taxValue: "20123456789",
    segment: null,
    contactPerson: null,
    contactEmail: null,
    phone: null,
    deliveryProfile: null,
    paymentCondition: null,
    status: "ACTIVE",
    buyerMembershipId: "membership-1",
    version: 1,
  };

  beforeEach(() => {
    authenticationApi = {
      signIn: vi.fn(),
      refresh: vi.fn(),
      getCurrentSession: vi.fn(),
      signOut: vi.fn(),
      previewWorkspace: vi.fn(),
    };
    buyerApi = { getCurrentAccount: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PortalSessionStore,
        PortalBuyerEligibilityService,
        { provide: NexaAuthenticationApi, useValue: authenticationApi },
        { provide: NexaBuyerRelationshipsApi, useValue: buyerApi },
      ],
    });
    sessions = TestBed.inject(PortalSessionStore);
    eligibility = TestBed.inject(PortalBuyerEligibilityService);
    tokens = TestBed.inject(NexaAccessTokenStore);
  });

  it("authorizes only the exact server Buyer membership and does not require a role match", async () => {
    await signIn();
    buyerApi.getCurrentAccount.mockReturnValue(of(account));

    expect(await firstValueFrom(eligibility.checkCurrent())).toBe("authorized");
    expect(eligibility.currentAccount()).toEqual(account);
  });

  it("does not let a workforce or BUYER role replace the Buyer membership equality check", async () => {
    await signIn({
      ...session,
      membership: {
        ...session.membership,
        roles: ["BUYER", "WORKSPACE_ADMIN"],
      },
    });
    buyerApi.getCurrentAccount.mockReturnValue(
      of({ ...account, buyerMembershipId: "different-membership" }),
    );

    expect(await firstValueFrom(eligibility.checkCurrent())).toBe(
      "relationship-required",
    );
    expect(eligibility.currentAccount()).toBeNull();
    expect(sessions.captureSessionLease()?.scope.membershipId).toBe(
      "membership-1",
    );
    expect(tokens.read()).toBe("signed-in-token");
  });

  it("fails closed when the API omits Buyer membership identity", async () => {
    await signIn();
    buyerApi.getCurrentAccount.mockReturnValue(
      of({ ...account, buyerMembershipId: null }),
    );

    expect(await firstValueFrom(eligibility.checkCurrent())).toBe(
      "relationship-required",
    );
    expect(eligibility.currentAccount()).toBeNull();
  });

  it("ignores a delayed account result after sign-out invalidates its captured lease", async () => {
    await signIn();
    const pendingAccount = new Subject<CurrentBuyerAccountResponse>();
    buyerApi.getCurrentAccount.mockReturnValue(pendingAccount);
    let result: string | undefined;
    const check = firstValueFrom(eligibility.checkCurrent()).then((value) => {
      result = value;
    });
    await Promise.resolve();

    const pendingSignOut = new Subject<void>();
    authenticationApi.signOut.mockReturnValue(pendingSignOut);
    const signOut = firstValueFrom(sessions.signOut());
    pendingAccount.next(account);
    pendingAccount.complete();
    await check;

    expect(result).toBe("stale");
    expect(eligibility.currentAccount()).toBeNull();
    expect(sessions.captureSessionLease()).toBeNull();

    pendingSignOut.next(undefined);
    pendingSignOut.complete();
    await signOut;
  });

  it("refreshes after one current-account 401 and retries the relationship check once", async () => {
    await signIn();
    authenticationApi.refresh.mockReturnValue(
      of({ accessToken: "refreshed-token" }),
    );
    authenticationApi.getCurrentSession.mockReturnValue(of(session));
    buyerApi.getCurrentAccount
      .mockReturnValueOnce(
        throwError(() => new NexaApiError("unauthenticated", 401, null)),
      )
      .mockReturnValueOnce(of(account));

    expect(await firstValueFrom(eligibility.checkCurrent())).toBe("authorized");
    expect(authenticationApi.refresh).toHaveBeenCalledOnce();
    expect(buyerApi.getCurrentAccount).toHaveBeenCalledTimes(2);
    expect(tokens.read()).toBe("refreshed-token");
    expect(eligibility.currentAccount()).toEqual(account);
  });

  it("invalidates the current session only for the explicit ACCESS_CONTEXT_INVALID code", async () => {
    await signIn();
    buyerApi.getCurrentAccount.mockReturnValue(
      throwError(
        () =>
          new NexaApiError("forbidden", 403, {
            code: "ACCESS_CONTEXT_INVALID",
          }),
      ),
    );

    expect(await firstValueFrom(eligibility.checkCurrent())).toBe(
      "invalidated",
    );
    expect(sessions.state()).toEqual({ status: "invalidated" });
    expect(tokens.read()).toBeNull();
  });

  it.each([
    [
      "403 relationship denial",
      new NexaApiError("forbidden", 403, { code: "FORBIDDEN" }),
    ],
    [
      "404 missing relationship",
      new NexaApiError("not-found", 404, { code: "NOT_FOUND" }),
    ],
  ])(
    "keeps ordinary %s scoped to Buyer relationship denial",
    async (_description, error) => {
      await signIn();
      const lease = sessions.captureSessionLease();
      buyerApi.getCurrentAccount.mockReturnValue(throwError(() => error));

      expect(await firstValueFrom(eligibility.checkCurrent())).toBe(
        "relationship-required",
      );
      expect(sessions.state()).toEqual({ status: "authenticated", session });
      expect(sessions.isSessionLeaseCurrent(lease!)).toBe(true);
      expect(tokens.read()).toBe("signed-in-token");
    },
  );

  it("fails closed when Buyer account data is malformed", async () => {
    await signIn();
    buyerApi.getCurrentAccount.mockReturnValue(
      of({ ...account, businessName: null }),
    );

    expect(await firstValueFrom(eligibility.checkCurrent())).toBe(
      "unavailable",
    );
    expect(eligibility.currentAccount()).toBeNull();
  });

  async function signIn(value: SessionResponse = session): Promise<void> {
    authenticationApi.signIn.mockReturnValue(
      of({ accessToken: "signed-in-token" }),
    );
    authenticationApi.getCurrentSession.mockReturnValue(of(value));
    await firstValueFrom(
      sessions.signIn({
        identifier: "buyer@example.test",
        password: "unit-test-only",
        workspaceSlug: "buyer-workspace",
      }),
    );
  }
});
