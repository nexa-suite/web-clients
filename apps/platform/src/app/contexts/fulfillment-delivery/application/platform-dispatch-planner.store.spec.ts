import { provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NexaApiError, NexaCommandRetryStore } from "@nexa/api";
import type {
  DispatchAssigneeResponse,
  DispatchReadinessResponse,
  DriverAssignmentResponse,
  FulfillmentResponse,
  OutgoingGoodsCheckResponse,
  PhysicalAllocationResponse,
} from "@nexa/api";
import { of, throwError } from "rxjs";
import type { PlatformSessionState } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { NexaFulfillmentDeliveryApi, NexaFulfillmentReadinessApi } from "@nexa/api";
import { PlatformDispatchPlannerStore } from "./platform-dispatch-planner.store";

const fulfillmentId = "fulfillment-1";
const allocationId = "allocation-1";
const allocationLineId = "allocation-line-1";
const driverId = "driver-membership-1";

describe("PlatformDispatchPlannerStore", () => {
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
    getCurrentDriverAssignment: ReturnType<typeof vi.fn>;
    getCurrentOutgoingGoodsCheck: ReturnType<typeof vi.fn>;
    listDispatchAssignees: ReturnType<typeof vi.fn>;
    assignDriver: ReturnType<typeof vi.fn>;
    planDispatchWindow: ReturnType<typeof vi.fn>;
    recordOutgoingGoodsCheck: ReturnType<typeof vi.fn>;
    dispatch: ReturnType<typeof vi.fn>;
  };
  let retryValues: Map<string, string>;
  let retryWrite: ReturnType<typeof vi.fn>;
  let retryRemove: ReturnType<typeof vi.fn>;
  let store: PlatformDispatchPlannerStore;

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
      session: {
        membership: {
          permissions: [
            "dispatch.read",
            "dispatch.assign",
            "dispatch.schedule",
            "logistics.read",
            "fulfillment.manage",
          ],
        },
      },
    });
    activeEpoch = lease.epoch;
    reads = {
      getFulfillment: vi.fn(() =>
        of({ body: fulfillment("READY_FOR_DISPATCH", 5), etag: '"5"' }),
      ),
      getPhysicalAllocation: vi.fn(() =>
        of({ body: allocation(), etag: '"7"' }),
      ),
    };
    commands = {
      getCurrentDriverAssignment: vi.fn(() => of(null)),
      getCurrentOutgoingGoodsCheck: vi.fn(() => of(null)),
      listDispatchAssignees: vi.fn(() =>
        of<readonly DispatchAssigneeResponse[]>([
          { id: driverId, displayName: "Warehouse Driver" },
        ]),
      ),
      assignDriver: vi.fn(() =>
        of({ body: assignment(6), etag: '"6"' }),
      ),
      planDispatchWindow: vi.fn((_id: string, _etag: string, _key: string, body: unknown) =>
        of({
          body: {
            fulfillmentId,
            fulfillmentVersion: 6,
            revision: 1,
            ...(body as { windowStart: string; windowEnd: string; reason: string }),
            recordedByMembershipId: "membership-1",
            recordedAt: "2026-10-09T10:00:00Z",
            replayed: false,
          },
          etag: '"6"',
        }),
      ),
      recordOutgoingGoodsCheck: vi.fn(() =>
        of({ body: outgoingCheck(), etag: '"6"' }),
      ),
      dispatch: vi.fn(() =>
        of({ body: fulfillment("HANDED_OVER", 7), etag: '"7"' }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
      PlatformDispatchPlannerStore,
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
    store = TestBed.inject(PlatformDispatchPlannerStore);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("requires logistics.read before loading or assigning an eligible member", async () => {
    sessionState.set({
      status: "authenticated",
      session: {
        membership: { permissions: ["dispatch.read", "dispatch.assign"] },
      },
    });
    store.inspect(readiness(), lease);
    store.setDispatchAssignee(driverId);
    const inspection = store.state();

    expect(inspection.status).toBe("ready");
    if (inspection.status === "ready") {
      expect(inspection.assignees).toEqual([]);
      expect(store.canAssignDriver(inspection)).toBe(false);
    }
    expect(commands.listDispatchAssignees).not.toHaveBeenCalled();
    expect(await store.assignDriver()).toBe(false);
    expect(commands.assignDriver).not.toHaveBeenCalled();
  });

  it("plans the delivery window before assigning, then checks observed goods before handoff", async () => {
    store.inspect(readiness(), lease);
    store.setDispatchWindow("windowStart", "2026-10-10T10:00");
    store.setDispatchWindow("windowEnd", "2026-10-10T11:00");
    store.setDispatchWindowReason("Customer confirmed the receiving window");
    let inspection = store.state();
    expect(inspection.status).toBe("ready");
    if (inspection.status !== "ready") throw new Error("Dispatch inspection did not load.");
    store.setDispatchAssignee(driverId);
    expect(store.canAssignDriver(inspection)).toBe(false);
    expect(await store.assignDriver()).toBe(false);
    expect(commands.assignDriver).not.toHaveBeenCalled();
    expect(store.canPlanDispatchWindow(inspection)).toBe(true);
    expect(await store.planDispatchWindow()).toBe(true);
    expect(commands.planDispatchWindow).toHaveBeenCalledOnce();
    expect(commands.planDispatchWindow).toHaveBeenCalledWith(
      fulfillmentId,
      '"5"',
      expect.any(String),
      {
        windowStart: new Date("2026-10-10T10:00").toISOString(),
        windowEnd: new Date("2026-10-10T11:00").toISOString(),
        reason: "Customer confirmed the receiving window",
      },
    );
    const planned = store.state();
    expect(planned.status).toBe("ready");
    if (planned.status !== "ready") throw new Error("Planned dispatch state was lost.");
    expect(planned.fulfillment.version).toBe(6);
    expect(planned.etag).toBe('"6"');
    expect(planned.assignment).toBeNull();

    expect(await store.assignDriver()).toBe(true);
    expect(commands.assignDriver).toHaveBeenCalledWith(
      fulfillmentId,
      '"6"',
      expect.any(String),
      {
        responsibleMembershipId: driverId,
        physicalAllocationId: allocationId,
        physicalAllocationVersion: 7,
      },
    );
    const assigned = store.state();
    expect(assigned.status).toBe("ready");
    if (assigned.status !== "ready") throw new Error("Assigned dispatch state was lost.");
    expect(assigned.assignment?.current).toBe(true);
    expect(assigned.fulfillment.version).toBe(6);

    const dockObservation = store.outgoingObservation(assigned, allocationLineId);
    expect(dockObservation.quantity).toBe("");
    store.setDispatchObservation(allocationLineId, "quantity", "5");
    store.setDispatchObservation(allocationLineId, "lotId", "observed-lot-1");
    inspection = store.state();
    if (inspection.status !== "ready") throw new Error("Dispatch inspection was lost.");
    expect(store.canRecordOutgoingCheck(inspection)).toBe(true);
    expect(await store.recordOutgoingCheck()).toBe(true);
    expect(commands.recordOutgoingGoodsCheck).toHaveBeenCalledWith(
      fulfillmentId,
      '"6"',
      expect.any(String),
      {
        physicalAllocationId: allocationId,
        physicalAllocationVersion: 7,
        observations: [
          {
            physicalAllocationLineId: allocationLineId,
            observedLotId: "observed-lot-1",
            observedQuantity: 5,
          },
        ],
      },
    );
    const checked = store.state();
    expect(checked.status).toBe("ready");
    if (checked.status !== "ready") throw new Error("Outgoing check state was lost.");
    expect(store.canDispatch(checked)).toBe(true);
    expect(await store.dispatchFulfillment()).toBe(true);
    expect(commands.dispatch).toHaveBeenCalledWith(
      fulfillmentId,
      '"6"',
      expect.any(String),
      {
        physicalAllocationId: allocationId,
        physicalAllocationVersion: 7,
        driverAssignmentId: "assignment-1",
        driverAssignmentVersion: 6,
        outgoingGoodsCheckId: "outgoing-check-1",
      },
    );
    const handedOver = store.state();
    expect(handedOver.status).toBe("ready");
    if (handedOver.status === "ready") {
      expect(handedOver.fulfillment.status).toBe("HANDED_OVER");
      expect(handedOver.etag).toBe('"7"');
    }
  });

  it("rejects stale readiness and keeps an ambiguous plan on the same ETag and retry key", async () => {
    reads.getFulfillment.mockReturnValueOnce(
      of({ body: fulfillment("READY_FOR_DISPATCH", 6), etag: '"6"' }),
    );
    store.inspect(readiness(), lease);
    expect(store.state().status).toBe("error");
    expect(commands.planDispatchWindow).not.toHaveBeenCalled();

    store.inspect(readiness(5), lease);
    store.setDispatchWindow("windowStart", "2026-10-10T10:00");
    store.setDispatchWindow("windowEnd", "2026-10-10T11:00");
    store.setDispatchWindowReason("Confirmed by customer");
    commands.planDispatchWindow
      .mockReturnValueOnce(
        throwError(() => new NexaApiError("network", 0, null)),
      )
      .mockImplementationOnce((_id: string, _etag: string, _key: string, body: {
        windowStart: string;
        windowEnd: string;
        reason: string;
      }) =>
        of({
          body: {
            fulfillmentId,
            fulfillmentVersion: 6,
            revision: 1,
            ...body,
            recordedByMembershipId: "membership-1",
            recordedAt: "2026-10-09T10:00:00Z",
            replayed: true,
          },
          etag: '"6"',
        }),
      );
    expect(await store.planDispatchWindow()).toBe(false);
    const failed = store.state();
    expect(failed.status).toBe("ready");
    if (failed.status !== "ready" || failed.command.status !== "error") {
      throw new Error("Expected an ambiguous dispatch-plan outcome.");
    }
    const { key, storageKey } = failed.command;
    expect(key).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(storageKey).toMatch(
      /^nexa:platform:fulfillment-command:user-1:tenant-1:workspace-1:membership-1:fulfillment-1:dispatch-window-plan:[a-f0-9]{64}$/,
    );
    expect(await store.retry()).toBe(true);
    expect(commands.planDispatchWindow).toHaveBeenCalledTimes(2);
    expect(commands.planDispatchWindow.mock.calls[0]).toEqual(
      commands.planDispatchWindow.mock.calls[1],
    );
    expect(commands.planDispatchWindow.mock.calls[0][1]).toBe('"5"');
    expect(commands.planDispatchWindow.mock.calls[0][2]).toBe(key);
    expect(retryWrite).toHaveBeenCalledOnce();
    expect(retryRemove).toHaveBeenCalledWith(storageKey);
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
    deliveryId: "delivery-1",
    deliveryStatus: "PLANNED",
    deliveryVersion: 1,
    lines: [],
  };
}

function allocation(): PhysicalAllocationResponse {
  return {
    allocationId,
    status: "ALLOCATED",
    version: 7,
    asOf: "2026-10-09T10:00:00Z",
    lines: [
      {
        physicalAllocationLineId: allocationLineId,
        skuId: "sku-1",
        catalogItemId: "item-1",
        warehouseId: "warehouse-1",
        zoneId: null,
        lotId: "allocated-lot-1",
        quantity: 5,
        releasedQuantity: 0,
        consumedQuantity: 0,
        remainingQuantity: 5,
        unit: "crate",
        expirationDate: null,
      },
    ],
  };
}

function readiness(version = 5): DispatchReadinessResponse {
  return {
    subjectKind: "PREPARED_FULFILLMENT",
    fulfillmentId,
    fulfillmentVersion: version,
    fulfillmentStatus: "READY_FOR_DISPATCH",
    physicalAllocationId: allocationId,
    physicalAllocationStatus: "ALLOCATED",
    physicalAllocationVersion: 7,
    deliveryId: "delivery-1",
    deliveryStatus: "PLANNED",
    deliveryVersion: 1,
    windowStart: null,
    windowEnd: null,
    windowSource: null,
    allocationComplete: true,
    pickingComplete: true,
    pickingEvidenceComplete: true,
    ready: true,
    reasons: [],
    lines: [],
    asOf: "2026-10-09T10:00:00Z",
  };
}

function assignment(version: number): DriverAssignmentResponse {
  return {
    id: "assignment-1",
    fulfillmentId,
    fulfillmentVersion: version,
    physicalAllocationId: allocationId,
    physicalAllocationVersion: 7,
    responsibleMembershipId: driverId,
    responsibleDisplayName: "Warehouse Driver",
    assignedAt: "2026-10-09T10:00:00Z",
    plannedDispatchAt: null,
    deliveryId: "delivery-1",
    current: true,
  };
}

function outgoingCheck(): OutgoingGoodsCheckResponse {
  return {
    id: "outgoing-check-1",
    fulfillmentId,
    fulfillmentVersion: 6,
    physicalAllocationId: allocationId,
    physicalAllocationVersion: 7,
    matches: true,
    current: true,
    openDiscrepancy: false,
    checkedByMembershipId: "membership-1",
    checkedAt: "2026-10-09T10:00:00Z",
    lines: [
      {
        physicalAllocationLineId: allocationLineId,
        skuId: "sku-1",
        expectedLotId: "allocated-lot-1",
        observedLotId: "observed-lot-1",
        expectedQuantity: 5,
        observedQuantity: 5,
        unit: "crate",
        matches: true,
      },
    ],
    replayed: false,
    discrepancy: null,
  };
}
