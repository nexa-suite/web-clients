import { provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NexaApiError, NexaCommandRetryStore } from "@nexa/api";
import type {
  FulfillmentResponse,
  OutgoingGoodsCheckResponse,
  PhysicalAllocationResponse,
} from "@nexa/api";
import { of, throwError } from "rxjs";
import type { PlatformSessionState } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { NexaFulfillmentDeliveryApi, NexaFulfillmentReadinessApi } from "@nexa/api";
import { PlatformWarehouseLifecycleStore } from "./platform-warehouse-lifecycle.store";

const fulfillmentId = "fulfillment-1";
const allocationId = "allocation-1";
const allocationLine1 = "allocation-line-1";
const allocationLine2 = "allocation-line-2";

describe("PlatformWarehouseLifecycleStore", () => {
  const lease = {
    epoch: 1,
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-1",
      surface: "PLATFORM" as const,
    },
  };
  let sessionState: ReturnType<typeof signal<PlatformSessionState>>;
  let activeEpoch: number;
  let reads: {
    getFulfillment: ReturnType<typeof vi.fn>;
    getPhysicalAllocation: ReturnType<typeof vi.fn>;
  };
  let commands: {
    getCurrentOutgoingGoodsCheck: ReturnType<typeof vi.fn>;
    startPicking: ReturnType<typeof vi.fn>;
    confirmPicking: ReturnType<typeof vi.fn>;
    resolveShortage: ReturnType<typeof vi.fn>;
    pack: ReturnType<typeof vi.fn>;
    stage: ReturnType<typeof vi.fn>;
    readyForDispatch: ReturnType<typeof vi.fn>;
    recordOutgoingGoodsCheck: ReturnType<typeof vi.fn>;
  };
  let retryValues: Map<string, string>;
  let retryWrite: ReturnType<typeof vi.fn>;
  let retryRemove: ReturnType<typeof vi.fn>;
  let store: PlatformWarehouseLifecycleStore;

  beforeEach(() => {
    retryValues = new Map();
    retryWrite = vi.fn((key: string, value: string) => retryValues.set(key, value));
    retryRemove = vi.fn((key: string) => retryValues.delete(key));
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "123e4567-e89b-42d3-a456-426614174000"),
      subtle: {
        digest: vi.fn(async () => new Uint8Array(32).buffer),
      },
    });
    sessionState = signal<PlatformSessionState>({
      status: "authenticated",
      session: { membership: { permissions: ["fulfillment.manage"] } },
    });
    activeEpoch = lease.epoch;
    reads = {
      getFulfillment: vi.fn(() =>
        of({ body: fulfillment("PICKING", 1), etag: '"1"' }),
      ),
      getPhysicalAllocation: vi.fn(() =>
        of({ body: allocation(), etag: '"7"' }),
      ),
    };
    commands = {
      getCurrentOutgoingGoodsCheck: vi.fn(() => of(null)),
      startPicking: vi.fn(() => of({ body: fulfillment("PICKING", 2), etag: '"2"' })),
      confirmPicking: vi.fn(() => of({ body: fulfillment("PICKED", 2), etag: '"2"' })),
      resolveShortage: vi.fn(() => of({ body: fulfillment("PICKED", 2), etag: '"2"' })),
      pack: vi.fn(() => of({ body: fulfillment("PACKED", 2), etag: '"2"' })),
      stage: vi.fn(() => of({ body: fulfillment("STAGED", 2), etag: '"2"' })),
      readyForDispatch: vi.fn(() =>
        of({ body: fulfillment("READY_FOR_DISPATCH", 2), etag: '"2"' }),
      ),
      recordOutgoingGoodsCheck: vi.fn(() =>
        of({ body: outgoingCheck(3), etag: '"3"' }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
      PlatformWarehouseLifecycleStore,
        { provide: NexaFulfillmentReadinessApi, useValue: reads },
        { provide: NexaFulfillmentDeliveryApi, useValue: commands },
        {
          provide: NexaCommandRetryStore,
          useValue: {
            read: vi.fn((key: string) => retryValues.get(key) ?? null),
            write: retryWrite,
            remove: retryRemove,
          },
        },
        {
          provide: PlatformSessionStore,
          useValue: {
            state: sessionState,
            captureSessionLease: vi.fn(() => lease),
            isSessionLeaseCurrent: vi.fn(
              (candidate: typeof lease) => candidate.epoch === activeEpoch,
            ),
            expireSessionIfCurrent: vi.fn(() => true),
            invalidateContextIfCurrent: vi.fn(() => true),
          },
        },
      ],
    });
    store = TestBed.inject(PlatformWarehouseLifecycleStore);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("requires current fulfillment.manage permission and a matching strong ETag", async () => {
    store.inspect(fulfillmentId, lease);
    sessionState.set({
      status: "authenticated",
      session: { membership: { permissions: ["fulfillment.read"] } },
    });

    expect(await store.startPicking()).toBe(false);
    expect(commands.startPicking).not.toHaveBeenCalled();

    sessionState.set({
      status: "authenticated",
      session: { membership: { permissions: ["fulfillment.manage"] } },
    });
    reads.getFulfillment.mockReturnValueOnce(
      of({ body: fulfillment("ALLOCATED", 3), etag: '"2"' }),
    );
    store.inspect(fulfillmentId, lease);
    const inspection = store.state();

    expect(inspection.status).toBe("ready");
    if (inspection.status === "ready") {
      expect(inspection.etag).toBeNull();
      expect(store.canStartPicking(inspection)).toBe(false);
    }
    expect(await store.startPicking()).toBe(false);
    expect(commands.startPicking).not.toHaveBeenCalled();
  });

  it("invalidates a loaded operation when its tenant session lease changes", async () => {
    store.inspect(fulfillmentId, lease);
    activeEpoch = lease.epoch + 1;

    expect(store.state().status).toBe("error");
    expect(await store.startPicking()).toBe(false);
    expect(commands.startPicking).not.toHaveBeenCalled();
  });

  it("records actual outgoing observations in Warehouse and keeps the response versioned", async () => {
    reads.getFulfillment.mockReturnValueOnce(
      of({ body: fulfillment("READY_FOR_DISPATCH", 3), etag: '"3"' }),
    );
    store.inspect(fulfillmentId, lease);
    let inspection = store.state();
    expect(inspection.status).toBe("ready");
    if (inspection.status !== "ready") throw new Error("Warehouse inspection did not load.");

    expect(store.canRecordOutgoingCheck(inspection)).toBe(false);
    store.setOutgoingObservation(allocationLine1, "quantity", "3");
    store.setOutgoingObservation(allocationLine1, "lotId", "observed-lot-1");
    store.setOutgoingObservation(allocationLine2, "quantity", "2");
    store.setOutgoingObservation(allocationLine2, "lotId", "observed-lot-2");
    inspection = store.state();
    if (inspection.status !== "ready") throw new Error("Warehouse inspection was lost.");

    expect(store.canRecordOutgoingCheck(inspection)).toBe(true);
    expect(await store.recordOutgoingGoodsCheck()).toBe(true);
    expect(commands.recordOutgoingGoodsCheck).toHaveBeenCalledWith(
      fulfillmentId,
      '"3"',
      expect.any(String),
      {
        physicalAllocationId: allocationId,
        physicalAllocationVersion: 7,
        observations: [
          {
            physicalAllocationLineId: allocationLine1,
            observedLotId: "observed-lot-1",
            observedQuantity: 3,
          },
          {
            physicalAllocationLineId: allocationLine2,
            observedLotId: "observed-lot-2",
            observedQuantity: 2,
          },
        ],
      },
    );
    const completed = store.state();
    expect(completed.status).toBe("ready");
    if (completed.status === "ready") {
      expect(completed.fulfillment.version).toBe(3);
      expect(completed.etag).toBe('"3"');
      expect(completed.outgoingCheck?.id).toBe("outgoing-check-1");
      expect(completed.command.status).toBe("success");
    }
  });

  it("does not load or write Warehouse evidence without fulfillment.manage", async () => {
    sessionState.set({
      status: "authenticated",
      session: { membership: { permissions: ["fulfillment.read"] } },
    });
    reads.getFulfillment.mockReturnValueOnce(
      of({ body: fulfillment("READY_FOR_DISPATCH", 3), etag: '"3"' }),
    );
    store.inspect(fulfillmentId, lease);
    const inspection = store.state();
    expect(inspection.status).toBe("ready");
    if (inspection.status !== "ready") throw new Error("Read-only inspection did not load.");

    expect(commands.getCurrentOutgoingGoodsCheck).not.toHaveBeenCalled();
    expect(store.canRecordOutgoingCheck(inspection)).toBe(false);
    expect(await store.recordOutgoingGoodsCheck()).toBe(false);
    expect(commands.recordOutgoingGoodsCheck).not.toHaveBeenCalled();
  });

  it("submits only the observed picking quantities and reuses an ambiguous command key", async () => {
    const initial = fulfillment("PICKING", 1);
    const allocationSnapshot = allocation();
    reads.getFulfillment.mockReturnValueOnce(
      of({ body: initial, etag: '"1"' }),
    );
    reads.getPhysicalAllocation.mockReturnValueOnce(
      of({ body: allocationSnapshot, etag: '"7"' }),
    );
    commands.confirmPicking
      .mockReturnValueOnce(
        throwError(() => new NexaApiError("network", 0, null)),
      )
      .mockReturnValueOnce(
        of({ body: fulfillment("SHORTAGE", 2), etag: '"2"' }),
      );
    store.inspect(fulfillmentId, lease);
    const inspection = store.state();
    expect(inspection.status).toBe("ready");
    if (inspection.status !== "ready") throw new Error("Inspection did not load.");

    const rows = store.pickingRows(inspection);
    expect(rows.map((row) => store.pickingObservation(inspection, row.key).quantity)).toEqual([
      "",
      "",
    ]);
    store.setPickingObservation(allocationLine1, "quantity", "2");
    store.setPickingObservation(allocationLine1, "lotId", "observed-lot-1");
    store.setPickingObservation(allocationLine1, "warehouseId", "warehouse-1");
    store.setPickingObservation(allocationLine2, "quantity", "1.5");
    store.setPickingObservation(allocationLine2, "lotId", "observed-lot-2");
    store.setPickingObservation(allocationLine2, "warehouseId", "warehouse-2");

    const actualObservation = {
      pickerIdentityId: null,
      startedAt: null,
      completedAt: null,
      allocationVersion: 7,
      notes: null,
      lines: [
        {
          fulfillmentLineId: "fulfillment-line-1",
          skuId: "sku-1",
          quantity: 2,
          unit: "crate",
          physicalAllocationLineId: allocationLine1,
          lotId: "observed-lot-1",
          warehouseId: "warehouse-1",
          fefoOverride: false,
          fefoOverrideReason: null,
        },
        {
          fulfillmentLineId: "fulfillment-line-1",
          skuId: "sku-1",
          quantity: 1.5,
          unit: "crate",
          physicalAllocationLineId: allocationLine2,
          lotId: "observed-lot-2",
          warehouseId: "warehouse-2",
          fefoOverride: false,
          fefoOverrideReason: null,
        },
      ],
    };

    expect(store.canConfirmPicking(inspection)).toBe(true);
    expect(await store.confirmPicking()).toBe(false);
    const failed = store.state();
    expect(failed.status).toBe("ready");
    if (failed.status !== "ready" || failed.command.status !== "error") {
      throw new Error("Expected an ambiguous command outcome.");
    }
    const storageKey = failed.command.storageKey;
    const key = failed.command.key;
    expect(storageKey).toMatch(
      /^nexa:platform:fulfillment-command:user-1:tenant-1:workspace-1:membership-1:fulfillment-1:picking-confirmation:[a-f0-9]{64}$/,
    );
    expect(key).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(await store.retry()).toBe(true);

    expect(commands.confirmPicking).toHaveBeenCalledTimes(2);
    expect(commands.confirmPicking).toHaveBeenNthCalledWith(
      1,
      fulfillmentId,
      '"1"',
      key,
      actualObservation,
    );
    expect(commands.confirmPicking).toHaveBeenNthCalledWith(
      2,
      fulfillmentId,
      '"1"',
      key,
      actualObservation,
    );
    expect(retryWrite).toHaveBeenCalledOnce();
    expect(retryRemove).toHaveBeenCalledWith(storageKey);
    const completed = store.state();
    expect(completed.status).toBe("ready");
    if (completed.status === "ready") expect(completed.etag).toBe('"2"');
  });
});

function fulfillment(
  status: FulfillmentResponse["status"],
  version: number,
): FulfillmentResponse {
  return {
    id: "fulfillment-1",
    salesOrderId: "sales-order-1",
    physicalAllocationId: "allocation-1",
    status,
    destinationSnapshot: null,
    version,
    createdAt: "2026-10-09T10:00:00Z",
    updatedAt: "2026-10-09T10:00:00Z",
    deliveryId: null,
    deliveryStatus: null,
    deliveryVersion: 0,
    lines: [
      {
        id: "fulfillment-line-1",
        skuId: "sku-1",
        catalogItemId: "item-1",
        orderedQuantity: 5,
        backedQuantity: 5,
        allocatedQuantity: 5,
        pickedQuantity: 0,
        packedQuantity: 0,
        stagedQuantity: 0,
        dispatchedQuantity: 0,
        deliveredQuantity: 0,
        rejectedQuantity: 0,
        cancelledQuantity: 0,
        unfulfilledQuantity: 0,
        remainingQuantity: 5,
        unit: "crate",
      },
    ],
  };
}

function allocation(): PhysicalAllocationResponse {
  return {
    allocationId: allocationId,
    status: "ALLOCATED",
    version: 7,
    asOf: "2026-10-09T10:00:00Z",
    lines: [
      {
        physicalAllocationLineId: allocationLine1,
        skuId: "sku-1",
        catalogItemId: "item-1",
        warehouseId: "warehouse-1",
        zoneId: null,
        lotId: "allocated-lot-1",
        quantity: 3,
        releasedQuantity: 0,
        consumedQuantity: 0,
        remainingQuantity: 3,
        unit: "crate",
        expirationDate: null,
      },
      {
        physicalAllocationLineId: allocationLine2,
        skuId: "sku-1",
        catalogItemId: "item-1",
        warehouseId: "warehouse-2",
        zoneId: null,
        lotId: "allocated-lot-2",
        quantity: 2,
        releasedQuantity: 0,
        consumedQuantity: 0,
        remainingQuantity: 2,
        unit: "crate",
        expirationDate: null,
      },
    ],
  };
}

function outgoingCheck(version: number): OutgoingGoodsCheckResponse {
  return {
    id: "outgoing-check-1",
    fulfillmentId,
    fulfillmentVersion: version,
    physicalAllocationId: allocationId,
    physicalAllocationVersion: 7,
    matches: true,
    current: true,
    openDiscrepancy: false,
    checkedByMembershipId: "membership-1",
    checkedAt: "2026-10-09T10:00:00Z",
    lines: [],
    replayed: false,
    discrepancy: null,
  };
}
