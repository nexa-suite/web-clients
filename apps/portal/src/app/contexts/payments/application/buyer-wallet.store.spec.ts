import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NexaApiError, NexaBuyerWalletApi } from "@nexa/api";
import { of, throwError } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerWalletStore } from "./buyer-wallet.store";

describe("BuyerWalletStore", () => {
  const lease = {
    epoch: 1,
    scope: {
      userId: "buyer-user",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "buyer-membership-1",
      surface: "PORTAL" as const,
    },
  };
  const activeWallet = {
    status: "ACTIVE" as const,
    currency: "PEN",
    postedBalance: 100,
    reservedBalance: 20,
    availableBalance: 80,
    movements: {
      items: [
        {
          type: "CREDIT_POSTED",
          amountDelta: 100,
          occurredAt: "2026-10-09T12:00:00Z",
        },
      ],
      page: 0,
      size: 25,
      total: 1,
    },
    capabilities: { orderPaymentSupported: true },
  };
  let session: {
    state: ReturnType<typeof signal>;
    captureSessionLease: ReturnType<typeof vi.fn>;
    isSessionLeaseCurrent: ReturnType<typeof vi.fn>;
    expireSessionIfCurrent: ReturnType<typeof vi.fn>;
    invalidateContextIfCurrent: ReturnType<typeof vi.fn>;
  };
  let api: { read: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    session = {
      state: signal({
        status: "authenticated",
        session: {
          surface: "PORTAL",
          membership: {
            roles: ["BUYER"],
            permissions: ["payment.read", "buyer.sales.write"],
          },
        },
      }),
      captureSessionLease: vi.fn(() => lease),
      isSessionLeaseCurrent: vi.fn(() => true),
      expireSessionIfCurrent: vi.fn(),
      invalidateContextIfCurrent: vi.fn(),
    };
    api = { read: vi.fn(() => of(activeWallet)) };
    TestBed.configureTestingModule({
      providers: [
        BuyerWalletStore,
        { provide: PortalSessionStore, useValue: session },
        { provide: NexaBuyerWalletApi, useValue: api },
      ],
    });
  });

  it("reads only when the current membership has payment.read", async () => {
    session.state.set({
      status: "authenticated",
      session: {
        surface: "PORTAL",
        membership: { roles: ["BUYER"], permissions: ["payment.create"] },
      },
    });
    const store = TestBed.inject(BuyerWalletStore);

    expect(store.canRead()).toBe(false);
    await store.load();

    expect(api.read).not.toHaveBeenCalled();
    expect(store.state()).toBeNull();
  });

  it("preserves active balance and movement facts from the API", async () => {
    const store = TestBed.inject(BuyerWalletStore);
    await store.load();

    expect(api.read).toHaveBeenCalledWith(0);
    expect(store.state()).toEqual({ status: "ready", lease, wallet: activeWallet });
  });

  it("masks a loaded wallet when payment.read is no longer present", async () => {
    const store = TestBed.inject(BuyerWalletStore);
    await store.load();
    session.state.set({
      status: "authenticated",
      session: { surface: "PORTAL", membership: { roles: ["BUYER"], permissions: [] } },
    });

    expect(store.state()).toBeNull();
  });

  it("preserves uninitialized null balances and withholds order payment", async () => {
    api.read.mockReturnValueOnce(
      of({
        status: "NOT_INITIALIZED" as const,
        currency: "PEN",
        postedBalance: null,
        reservedBalance: null,
        availableBalance: null,
        movements: { items: [], page: 0, size: 25, total: 0 },
        capabilities: { orderPaymentSupported: true },
      }),
    );
    const store = TestBed.inject(BuyerWalletStore);
    await store.load();

    const result = store.state();
    expect(result?.status).toBe("ready");
    if (result?.status !== "ready") throw new Error("Wallet was not loaded.");
    expect(result.wallet.status).toBe("NOT_INITIALIZED");
    expect(result.wallet.postedBalance).toBeNull();
    expect(result.wallet.availableBalance).toBeNull();
    expect(store.orderPaymentSupported()).toBe(false);
  });

  it("fails wallet tender capability closed when the field is absent or not a boolean", async () => {
    api.read.mockReturnValueOnce(
      of({
        status: "ACTIVE" as const,
        currency: "PEN",
        postedBalance: 100,
        reservedBalance: 0,
        availableBalance: 100,
        movements: { items: [], page: 0, size: 25, total: 0 },
      }),
    );
    const store = TestBed.inject(BuyerWalletStore);
    await store.load();
    expect(store.orderPaymentSupported()).toBe(false);

    api.read.mockReturnValueOnce(
      of({
        ...activeWallet,
        capabilities: { orderPaymentSupported: "true" },
      }),
    );
    await store.load();
    expect(store.orderPaymentSupported()).toBe(false);
  });

  it("shows a distinct unavailable state for the API 503 response", async () => {
    api.read.mockReturnValueOnce(
      throwError(() => new NexaApiError("server", 503, null)),
    );
    const store = TestBed.inject(BuyerWalletStore);
    await store.load();

    expect(store.state()).toEqual({
      status: "unavailable",
      lease,
      message: "Wallet reading is currently unavailable. Try again later.",
    });
  });

  it("keeps server-denied reads empty", async () => {
    api.read.mockReturnValueOnce(
      throwError(() => new NexaApiError("forbidden", 403, null)),
    );
    const store = TestBed.inject(BuyerWalletStore);
    await store.load();

    const result = store.state();
    expect(result?.status).toBe("error");
    if (result?.status !== "error") throw new Error("Wallet failure was lost.");
    expect(result.message).toContain("API denied");
    expect("wallet" in result).toBe(false);
  });
});
