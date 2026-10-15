import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import {
  NexaApiError,
  NexaBuyerCatalogApi,
  NexaCommandRetryStore,
  NexaWarehouseInventoryApi,
  type BuyerCatalogItemSummaryResponse,
  type ReceiveWarehouseStockRequest,
  type SessionResponse,
} from "@nexa/api";
import { PlatformSessionStore, type PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformInventoryReceivingStore } from "./platform-inventory-receiving.store";

const warehouseId = "00000000-0000-4000-8000-000000000001";
const zoneId = "00000000-0000-4000-8000-000000000002";

function session(userId: string, permissions = ["warehouse:read", "catalog:read"]): SessionResponse {
  return {
    surface: "PLATFORM",
    user: { userId },
    tenant: { tenantId: `tenant-${userId}` },
    workspace: { workspaceId: `workspace-${userId}` },
    membership: { membershipId: `membership-${userId}`, permissions },
  };
}

function leaseFor(value: SessionResponse, epoch: number): PlatformSessionLease {
  return {
    epoch,
    scope: {
      userId: value.user!.userId!,
      tenantId: value.tenant!.tenantId!,
      workspaceId: value.workspace!.workspaceId!,
      membershipId: value.membership!.membershipId!,
      surface: "PLATFORM",
    },
  };
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("PlatformInventoryReceivingStore", () => {
  it("allows read-only members to filter scoped stock and catalog, then clears filters on scope epoch change", async () => {
    const firstSession = session("user-a");
    const secondSession = session("user-b");
    const state = signal({ status: "authenticated" as const, session: firstSession });
    let lease = leaseFor(firstSession, 1);
    const sessions = {
      state,
      captureSessionLease: () => lease,
      isSessionLeaseCurrent: (candidate: PlatformSessionLease) => candidate.epoch === lease.epoch,
    };
    const inventory = {
      listWarehouses: vi.fn(() => of({
        items: [{ id: warehouseId, code: "WH-1", name: "Warehouse 1", status: "ACTIVE", version: 1 }],
        page: 0,
        size: 100,
        total: 1,
      })),
      listZones: vi.fn(() => of({
        items: [{ id: zoneId, warehouseId, code: "ZONE-1", name: "Zone 1", type: "DRY", temperatureMin: null, temperatureMax: null, status: "ACTIVE", version: 1 }],
        page: 0,
        size: 100,
        total: 1,
      })),
      listLots: vi.fn(() => of({ items: [], page: 0, size: 25, total: 0 })),
      receive: vi.fn(),
    };
    const catalog = {
      filterOptions: vi.fn(() => of({ items: [], page: 0, size: 100, total: 0 })),
      listCatalog: vi.fn(() => of({ items: [], page: 0, size: 25, totalItems: 0, totalPages: 0, sort: { field: "itemName", direction: "asc" } })),
      getCatalogItem: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        PlatformInventoryReceivingStore,
        { provide: PlatformSessionStore, useValue: sessions },
        { provide: NexaWarehouseInventoryApi, useValue: inventory },
        { provide: NexaBuyerCatalogApi, useValue: catalog },
        { provide: NexaCommandRetryStore, useValue: { read: () => null, write: vi.fn(), remove: vi.fn() } },
      ],
    });
    const store = TestBed.inject(PlatformInventoryReceivingStore);
    TestBed.flushEffects();
    await flushAsyncWork();

    expect(store.canRead()).toBe(true);
    expect(store.canReceive()).toBe(false);
    store.setWarehouse(warehouseId);
    await flushAsyncWork();
    expect(store.filters().warehouseId).toBe(warehouseId);
    expect(store.zones().map((zone) => zone.id)).toEqual([zoneId]);
    store.setZone(zoneId);
    store.updateCatalogSearch("milk", "Brand", "Dairy");
    await store.searchCatalog();
    expect(store.filters().zoneId).toBe(zoneId);
    expect(catalog.listCatalog).toHaveBeenCalledWith(expect.objectContaining({ q: "milk", brand: "Brand", category: "Dairy" }));

    lease = leaseFor(secondSession, 2);
    state.set({ status: "authenticated", session: secondSession });
    TestBed.flushEffects();
    expect(store.filters()).toEqual({ warehouseId: "", zoneId: "", catalogItemId: "", status: "" });
    expect(store.receiptDraft().catalogItemId).toBe("");
    TestBed.resetTestingModule();
  });

  it("retries an unknown receipt outcome with same frozen body and idempotency key", async () => {
    const activeSession = session("receiver", ["warehouse:read", "warehouse:write", "catalog:read"]);
    const lease = leaseFor(activeSession, 1);
    const state = signal({ status: "authenticated" as const, session: activeSession });
    const sessions = {
      state,
      captureSessionLease: () => lease,
      isSessionLeaseCurrent: (candidate: PlatformSessionLease) => candidate.epoch === lease.epoch,
    };
    const skuId = "00000000-0000-4000-8000-000000000003";
    const item = {
      catalogItemId: "CAT-001",
      productId: "PRODUCT-1",
      itemName: "Milk",
      sellableSkuId: skuId,
      skuCode: "MILK-1L",
      unitOfMeasure: "kg",
      status: "ACTIVE",
    };
    const receiptLot = (request: ReceiveWarehouseStockRequest) => ({
      id: "00000000-0000-4000-8000-000000000010",
      warehouseId: request.warehouseId,
      zoneId: request.zoneId,
      catalogItemId: request.catalogItemId,
      batchNumber: request.batchNumber,
      expirationDate: request.expirationDate,
      receivedAt: request.receivedAt,
      productionDate: request.productionDate,
      onHand: request.quantity,
      reserved: 0,
      available: request.quantity,
      unit: request.unit,
      status: "AVAILABLE",
      version: 1,
      skuId: request.skuId,
    });
    const receive = vi.fn();
    receive.mockReturnValueOnce(throwError(() => new NexaApiError("network", 0, null)));
    receive.mockImplementation((request: ReceiveWarehouseStockRequest) => of({
      body: receiptLot(request),
      etag: '"1"',
      status: 201,
    }));
    const inventory = {
      listWarehouses: vi.fn(() => of({ items: [{ id: warehouseId, code: "WH-1", name: "Warehouse 1", status: "ACTIVE", version: 1 }], page: 0, size: 100, total: 1 })),
      listZones: vi.fn(() => of({ items: [{ id: zoneId, warehouseId, code: "ZONE-1", name: "Zone 1", type: "DRY", temperatureMin: null, temperatureMax: null, status: "ACTIVE", version: 1 }], page: 0, size: 100, total: 1 })),
      listLots: vi.fn(() => of({ items: [], page: 0, size: 25, total: 0 })),
      receive,
    };
    const catalog = {
      filterOptions: vi.fn(() => of({ items: [], page: 0, size: 100, total: 0 })),
      listCatalog: vi.fn(() => of({ items: [item], page: 0, size: 25, totalItems: 1, totalPages: 1, sort: { field: "itemName", direction: "asc" } })),
      getCatalogItem: vi.fn(() => of(item)),
    };
    const retries = { read: vi.fn(() => null), write: vi.fn(), remove: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PlatformInventoryReceivingStore,
        { provide: PlatformSessionStore, useValue: sessions },
        { provide: NexaWarehouseInventoryApi, useValue: inventory },
        { provide: NexaBuyerCatalogApi, useValue: catalog },
        { provide: NexaCommandRetryStore, useValue: retries },
      ],
    });
    const store = TestBed.inject(PlatformInventoryReceivingStore);
    TestBed.flushEffects();
    await flushAsyncWork();
    await store.searchCatalog();
    store.setCatalogFilter(item as BuyerCatalogItemSummaryResponse);
    await flushAsyncWork();
    store.setWarehouse(warehouseId);
    await flushAsyncWork();
    store.setZone(zoneId);
    store.updateReceiptDraft({
      batchNumber: "BATCH-001",
      productionDate: "2026-10-10",
      receivedAtLocal: "2026-10-15T12:00",
      expirationDate: "2027-10-10",
      quantity: "5",
      temperatureReading: "4",
    });

    await store.submitReceipt();

    expect(store.pendingReceipt()).not.toBeNull();
    expect(store.receiptError()).toContain("outcome is unknown");
    expect(receive).toHaveBeenCalledTimes(1);
    expect(retries.write).toHaveBeenCalledTimes(1);
    await store.retryPendingReceipt();
    expect(receive).toHaveBeenCalledTimes(2);
    expect(receive.mock.calls[1]).toEqual(receive.mock.calls[0]);
    expect(store.pendingReceipt()).toBeNull();
    expect(retries.remove).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
  });
});
