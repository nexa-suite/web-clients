import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NexaApiError, NexaCommandRetryStore } from "@nexa/api";
import type {
  PlatformSessionLease,
  PlatformSessionState,
} from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformConfirmedSalesOrdersQuery } from "../../sales-commitment/application/public-api";
import type { PlatformConfirmedSalesOrder } from "../../sales-commitment/application/public-api";
import { PlatformBusinessDocumentsApiAdapter } from "./business-documents-api.adapter";
import { PlatformOrderSummaryGenerationStore } from "./platform-order-summary-generation.store";

describe("PlatformOrderSummaryGenerationStore", () => {
  const firstLease: PlatformSessionLease = {
    epoch: 1,
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-1",
      surface: "PLATFORM",
    },
  };
  const secondLease: PlatformSessionLease = {
    epoch: 2,
    scope: { ...firstLease.scope, membershipId: "membership-2" },
  };
  const order: PlatformConfirmedSalesOrder = {
    id: "sales-order-1",
    number: "SO-2026-001",
    status: "IN_FULFILLMENT",
    confirmedAt: "2026-10-09T10:00:00Z",
  };
  let activeLease: ReturnType<typeof signal<PlatformSessionLease | null>>;
  let sessionState: ReturnType<typeof signal<PlatformSessionState>>;
  let session: {
    state: ReturnType<typeof signal<PlatformSessionState>>;
    captureSessionLease: () => PlatformSessionLease | null;
    isSessionLeaseCurrent: (lease: PlatformSessionLease) => boolean;
    expireSessionIfCurrent: ReturnType<typeof vi.fn>;
    invalidateContextIfCurrent: ReturnType<typeof vi.fn>;
  };
  let orders: { list: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let api: { requestOrderSummaryPdf: ReturnType<typeof vi.fn> };
  let retryValues: Map<string, string>;
  let retryCommands: {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let store: PlatformOrderSummaryGenerationStore;

  function authenticatedState(
    lease: PlatformSessionLease,
    permissions: readonly string[] = ["sales.order.read", "document.generate"],
  ): PlatformSessionState {
    return {
      status: "authenticated",
      session: {
        user: { userId: lease.scope.userId },
        tenant: { tenantId: lease.scope.tenantId },
        workspace: { workspaceId: lease.scope.workspaceId },
        membership: {
          membershipId: lease.scope.membershipId,
          permissions,
        },
        surface: "PLATFORM",
      },
    };
  }

  beforeEach(() => {
    activeLease = signal<PlatformSessionLease | null>(firstLease);
    sessionState = signal<PlatformSessionState>(authenticatedState(firstLease));
    const isSessionLeaseCurrent = (lease: PlatformSessionLease) =>
      sessionState().status === "authenticated" &&
      activeLease()?.epoch === lease.epoch &&
      activeLease()?.scope.membershipId === lease.scope.membershipId;
    session = {
      state: sessionState,
      captureSessionLease: () =>
        sessionState().status === "authenticated" ? activeLease() : null,
      isSessionLeaseCurrent,
      expireSessionIfCurrent: vi.fn((lease: PlatformSessionLease) => {
        if (!isSessionLeaseCurrent(lease)) return false;
        activeLease.set(null);
        sessionState.set({ status: "unauthenticated" });
        return true;
      }),
      invalidateContextIfCurrent: vi.fn((lease: PlatformSessionLease) => {
        if (!isSessionLeaseCurrent(lease)) return false;
        activeLease.set(null);
        sessionState.set({ status: "error", error: "context invalid" });
        return true;
      }),
    };
    orders = {
      list: vi.fn().mockResolvedValue({
        items: [order],
        page: 0,
        size: 25,
        total: 1,
        totalPages: 1,
      }),
      get: vi.fn().mockResolvedValue(order),
    };
    api = {
      requestOrderSummaryPdf: vi.fn().mockResolvedValue({
        id: "generation-request-1",
        documentId: "document-1",
        status: "REQUESTED",
        requestedAt: "2026-10-09T10:05:00Z",
        completedAt: null,
      }),
    };
    retryValues = new Map();
    retryCommands = {
      read: vi.fn((key: string) => retryValues.get(key) ?? null),
      write: vi.fn((key: string, value: string) => retryValues.set(key, value)),
      remove: vi.fn((key: string) => {
        retryValues.delete(key);
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        PlatformOrderSummaryGenerationStore,
        { provide: PlatformBusinessDocumentsApiAdapter, useValue: api },
        { provide: PlatformConfirmedSalesOrdersQuery, useValue: orders },
        { provide: NexaCommandRetryStore, useValue: retryCommands },
        { provide: PlatformSessionStore, useValue: session },
      ],
    });
    store = TestBed.inject(PlatformOrderSummaryGenerationStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it("does not issue when the active membership lacks document.generate", async () => {
    sessionState.set(authenticatedState(firstLease, ["sales.order.read"]));

    await store.loadOrder(order.id);
    await store.requestOrderSummaryPdf();

    expect(orders.get).not.toHaveBeenCalled();
    expect(api.requestOrderSummaryPdf).not.toHaveBeenCalled();
    expect(retryCommands.write).not.toHaveBeenCalled();
    expect(store.canGenerate()).toBe(false);
  });

  it("requires the API's typed Sales Order read permission", async () => {
    sessionState.set(
      authenticatedState(firstLease, ["sales.read", "document.generate"]),
    );

    await store.loadCandidates();

    expect(orders.list).not.toHaveBeenCalled();
    expect(store.candidatesState()).toMatchObject({
      kind: "error",
      errorMessage: expect.stringContaining("sales.order.read"),
    });
    expect(store.canReadSalesOrders()).toBe(false);
  });

  it("requires a confirmed Sales Order and never submits a non-confirmed order", async () => {
    orders.get.mockResolvedValueOnce(null);

    await store.loadOrder("draft-order");
    await store.requestOrderSummaryPdf();

    expect(store.requestState()).toMatchObject({ kind: "unavailable" });
    expect(api.requestOrderSummaryPdf).not.toHaveBeenCalled();
    expect(retryCommands.write).not.toHaveBeenCalled();
  });

  it("reuses the scoped retry identity after an ambiguous response and links the accepted document", async () => {
    api.requestOrderSummaryPdf
      .mockRejectedValueOnce(new Error("connection timed out"))
      .mockResolvedValueOnce({
        id: "generation-request-1",
        documentId: "document-1",
        status: "REQUESTED",
        requestedAt: "2026-10-09T10:05:00Z",
        completedAt: null,
      });
    await store.loadOrder(order.id);

    await store.requestOrderSummaryPdf();
    expect(store.requestState()).toMatchObject({ kind: "error", order });
    expect(retryValues.size).toBe(1);
    expect(retryCommands.write.mock.calls[0]?.[0]).toBe(
      "nexa:platform:order-summary-generation:user-1:tenant-1:workspace-1:membership-1:sales-order-1",
    );
    const [, idempotencyKey] = api.requestOrderSummaryPdf.mock.calls[0] as [
      string,
      string,
    ];
    expect(idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    await store.requestOrderSummaryPdf();

    expect(api.requestOrderSummaryPdf).toHaveBeenNthCalledWith(
      1,
      order.id,
      idempotencyKey,
    );
    expect(api.requestOrderSummaryPdf).toHaveBeenNthCalledWith(
      2,
      order.id,
      idempotencyKey,
    );
    expect(store.requestState()).toMatchObject({
      kind: "submitted",
      order,
      request: { documentId: "document-1", status: "REQUESTED" },
    });
    expect(retryValues.size).toBe(0);
  });

  it("does not expire a replacement session for a late generation 401", async () => {
    await store.loadOrder(order.id);
    let rejectRequest!: (error: unknown) => void;
    api.requestOrderSummaryPdf.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectRequest = reject)),
    );
    const pending = store.requestOrderSummaryPdf();
    activeLease.set(secondLease);
    sessionState.set(authenticatedState(secondLease));
    rejectRequest(new NexaApiError("unauthenticated", 401, null));
    await pending;

    expect(session.expireSessionIfCurrent).not.toHaveBeenCalled();
    expect(store.requestState()).toEqual({ kind: "idle", order: null });
  });
});
