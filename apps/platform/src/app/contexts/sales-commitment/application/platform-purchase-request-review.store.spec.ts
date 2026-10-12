import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { NexaApiError, NexaCommandRetryStore, NexaSalesCommitmentApi } from "@nexa/api";
import type { PurchaseRequestDetail, SalesOrder } from "@nexa/api";
import type {
  PlatformSessionLease,
  PlatformSessionState,
} from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformPurchaseRequestReviewStore } from "./platform-purchase-request-review.store";

describe("PlatformPurchaseRequestReviewStore", () => {
  const lease: PlatformSessionLease = {
    epoch: 2,
    scope: {
      userId: "sales-user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "sales-membership-1",
      surface: "PLATFORM",
    },
  };
  const request: PurchaseRequestDetail = {
    id: "pr-1",
    code: "PR-0001",
    clientAccountId: "buyer-account-1",
    buyerMembershipId: "buyer-membership-1",
    status: "SUBMITTED",
    priority: "NORMAL",
    requestedDeliveryDate: "2026-10-20",
    deliveryProfileSnapshot: null,
    paymentOption: "BANK_TRANSFER",
    comment: null,
    reviewNote: null,
    lines: [],
    version: 9,
    expiresAt: null,
  };
  const rejectedRequest: PurchaseRequestDetail = {
    ...request,
    status: "REJECTED",
    version: 10,
    reviewNote: "Inventory cannot support the requested date.",
  };
  const changedRequest: PurchaseRequestDetail = {
    ...request,
    status: "CHANGES_PROPOSED",
    version: 10,
  };
  const convertedRequest: PurchaseRequestDetail = {
    ...request,
    status: "CONVERTED",
    version: 10,
  };
  const order: SalesOrder = {
    id: "order-1",
    number: "SO-0001",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    clientAccountId: "buyer-account-1",
    createdByMembershipId: "sales-membership-1",
    buyerMembershipId: "buyer-membership-1",
    sourcePurchaseRequestId: request.id,
    priority: "NORMAL",
    requestedDeliveryDate: "2026-10-20",
    deliverySnapshot: null,
    paymentOption: "BANK_TRANSFER",
    notes: null,
    currency: "USD",
    total: "100.00",
    status: "CONFIRMED",
    createdAt: "2026-10-09T00:00:00Z",
    updatedAt: "2026-10-09T00:00:00Z",
    confirmedAt: "2026-10-09T00:00:00Z",
    rejectedAt: null,
    cancelledAt: null,
    rejectionReason: null,
    version: 1,
    lines: [],
    originType: "PURCHASE_REQUEST",
    commercialCommitmentId: "commitment-1",
  };

  let api: {
    getPurchaseRequest: ReturnType<typeof vi.fn>;
    rejectPurchaseRequest: ReturnType<typeof vi.fn>;
    convertPurchaseRequest: ReturnType<typeof vi.fn>;
  };
  let sessions: {
    state: ReturnType<typeof signal<PlatformSessionState>>;
    captureSessionLease: ReturnType<typeof vi.fn>;
    isSessionLeaseCurrent: ReturnType<typeof vi.fn>;
  };
  let retryValues: Map<string, string>;
  let retryCommands: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let store: PlatformPurchaseRequestReviewStore;

  beforeEach(() => {
    retryValues = new Map();
    retryCommands = {
      read: vi.fn((key: string) => retryValues.get(key) ?? null),
      write: vi.fn((key: string, value: string) => retryValues.set(key, value)),
      remove: vi.fn((key: string) => { retryValues.delete(key); }),
    };
    api = {
      getPurchaseRequest: vi.fn().mockReturnValue(of(apiResponse(request, '"9"'))),
      rejectPurchaseRequest: vi.fn()
        .mockReturnValueOnce(throwError(() => new Error("response timed out")))
        .mockReturnValueOnce(of(apiResponse(rejectedRequest, '"10"'))),
      convertPurchaseRequest: vi.fn()
        .mockReturnValueOnce(throwError(() => new Error("response timed out")))
        .mockReturnValueOnce(of(apiResponse(order, '"1"'))),
    };
    sessions = {
      state: signal<PlatformSessionState>(authenticatedState([
        "sales.purchase_request.review",
      ])),
      captureSessionLease: vi.fn(() => lease),
      isSessionLeaseCurrent: vi.fn(() => true),
    };
    TestBed.configureTestingModule({
      providers: [
        PlatformPurchaseRequestReviewStore,
        { provide: NexaSalesCommitmentApi, useValue: api },
        { provide: NexaCommandRetryStore, useValue: retryCommands },
        { provide: PlatformSessionStore, useValue: sessions },
      ],
    });
    store = TestBed.inject(PlatformPurchaseRequestReviewStore);
  });

  it("confirms an uncertain rejection from current server state without replaying a mutated idempotency hash", async () => {
    api.getPurchaseRequest
      .mockReturnValueOnce(of(apiResponse(request, '"9"')))
      .mockReturnValueOnce(of(apiResponse(rejectedRequest, '"10"')));
    await store.load(request.id);
    await store.reject("Inventory cannot support the requested date.");

    expect(store.state().status).toBe("error");
    expect(store.state().request).toEqual(request);
    expect(store.state().pendingAction).toBe("reject");
    expect(store.state().pendingNote).toBe("Inventory cannot support the requested date.");
    expect(retryValues.size).toBe(1);

    await store.reject("I changed my mind after the request timed out.");
    expect(api.getPurchaseRequest).toHaveBeenCalledTimes(2);
    expect(api.rejectPurchaseRequest).toHaveBeenCalledTimes(1);
    expect(store.state().status).toBe("rejected");
    expect(store.state().request).toEqual(rejectedRequest);
    expect(store.state().pendingAction).toBeNull();
    expect(retryValues.size).toBe(0);
  });

  it("replays the saved rejection only when a state check confirms the original version is still reviewable", async () => {
    api.getPurchaseRequest
      .mockReturnValueOnce(of(apiResponse(request, '"9"')))
      .mockReturnValueOnce(of(apiResponse(request, '"9"')));
    api.rejectPurchaseRequest
      .mockReturnValueOnce(throwError(() => new Error("response timed out")))
      .mockReturnValueOnce(of(apiResponse(rejectedRequest, '"10"')));

    await store.load(request.id);
    await store.reject("Inventory cannot support the requested date.");
    const firstCall = api.rejectPurchaseRequest.mock.calls[0] as [string, number, string, string];

    await store.reject("This replacement note must not change the saved command.");

    expect(api.rejectPurchaseRequest).toHaveBeenNthCalledWith(1, request.id, request.version, firstCall[2], firstCall[3]);
    expect(api.rejectPurchaseRequest).toHaveBeenNthCalledWith(2, request.id, request.version, firstCall[2], firstCall[3]);
    expect(store.state().status).toBe("rejected");
    expect(store.state().request).toEqual(rejectedRequest);
  });

  it("does not convert a request with proposed changes before Buyer acceptance", async () => {
    api.getPurchaseRequest.mockReturnValueOnce(of(apiResponse(changedRequest, '"10"')));
    await store.load(request.id);

    await store.convert();

    expect(api.convertPurchaseRequest).not.toHaveBeenCalled();
    expect(store.state().request).toEqual(changedRequest);
    expect(retryValues.size).toBe(0);
  });

  it("keeps routine decisions read-only without the typed Sales review permission", async () => {
    sessions.state.set(authenticatedState([
      "sales.purchase_request.read",
      "sales.order.read",
      "client.manage",
    ]));
    await store.load(request.id);

    expect(store.canDecidePurchaseRequest()).toBe(false);
    await store.reject("Not authorized for Sales review.");
    await store.convert();

    expect(api.rejectPurchaseRequest).not.toHaveBeenCalled();
    expect(api.convertPurchaseRequest).not.toHaveBeenCalled();
    expect(retryCommands.write).not.toHaveBeenCalled();
  });

  it("reconciles a stale conversion immediately when the API rejects its If-Match version", async () => {
    api.getPurchaseRequest
      .mockReturnValueOnce(of(apiResponse(request, '"9"')))
      .mockReturnValueOnce(of(apiResponse(changedRequest, '"10"')));
    api.convertPurchaseRequest.mockReset().mockReturnValueOnce(throwError(() => new NexaApiError("precondition", 412, null)));
    await store.load(request.id);

    await store.convert();

    expect(api.getPurchaseRequest).toHaveBeenCalledTimes(2);
    expect(store.state().status).toBe("ready");
    expect(store.state().request).toEqual(changedRequest);
    expect(store.state().pendingAction).toBeNull();
    expect(store.state().message).toContain("Buyer must accept");
    expect(retryValues.size).toBe(0);
  });

  it("checks current request state before replaying and discards a stale conversion identity", async () => {
    api.getPurchaseRequest
      .mockReturnValueOnce(of(apiResponse(request, '"9"')))
      .mockReturnValueOnce(of(apiResponse(changedRequest, '"10"')));
    await store.load(request.id);
    await store.convert();
    const firstCall = api.convertPurchaseRequest.mock.calls[0] as [string, number, string, string | undefined];

    await store.convert();

    expect(api.getPurchaseRequest).toHaveBeenCalledTimes(2);
    expect(api.convertPurchaseRequest).toHaveBeenCalledTimes(1);
    expect(firstCall[1]).toBe(request.version);
    expect(store.state().status).toBe("ready");
    expect(store.state().request).toEqual(changedRequest);
    expect(store.state().pendingAction).toBeNull();
    expect(store.state().message).toContain("Buyer must accept");
    expect(retryValues.size).toBe(0);
  });

  it("replays an uncertain conversion with the same version and idempotency key when the request is unchanged", async () => {
    api.getPurchaseRequest
      .mockReturnValueOnce(of(apiResponse(request, '"9"')))
      .mockReturnValueOnce(of(apiResponse(request, '"9"')));
    await store.load(request.id);
    await store.convert();
    const firstCall = api.convertPurchaseRequest.mock.calls[0] as [string, number, string, string | undefined];

    await store.convert();

    expect(api.convertPurchaseRequest).toHaveBeenNthCalledWith(1, request.id, request.version, firstCall[2], undefined);
    expect(api.convertPurchaseRequest).toHaveBeenNthCalledWith(2, request.id, request.version, firstCall[2], undefined);
    expect(store.state().status).toBe("converted");
    expect(store.state().order).toEqual(order);
    expect(retryValues.size).toBe(0);
  });

  it("replays the same conversion command to recover its saved response after the request becomes converted", async () => {
    api.getPurchaseRequest
      .mockReturnValueOnce(of(apiResponse(request, '"9"')))
      .mockReturnValueOnce(of(apiResponse(convertedRequest, '"10"')));
    await store.load(request.id);
    await store.convert();
    const firstCall = api.convertPurchaseRequest.mock.calls[0] as [string, number, string, string | undefined];

    await store.convert();

    expect(api.convertPurchaseRequest).toHaveBeenNthCalledWith(2, request.id, request.version, firstCall[2], undefined);
    expect(store.state().status).toBe("converted");
    expect(store.state().order).toEqual(order);
    expect(retryValues.size).toBe(0);
  });
});

function authenticatedState(permissions: readonly string[]): PlatformSessionState {
  return {
    status: "authenticated",
    session: { membership: { permissions } },
  };
}

function apiResponse<T>(body: T, etag: string) {
  return { body, headers: { get: (name: string) => name.toLowerCase() === "etag" ? etag : null } };
}
