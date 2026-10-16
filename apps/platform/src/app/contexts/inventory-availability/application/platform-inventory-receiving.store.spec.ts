import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import {
  NexaApiError,
  NexaBusinessDocumentsApi,
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
        { provide: NexaBusinessDocumentsApi, useValue: { uploadWarehouseEvidence: vi.fn(), getEvidence: vi.fn() } },
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
        { provide: NexaBusinessDocumentsApi, useValue: { uploadWarehouseEvidence: vi.fn(), getEvidence: vi.fn() } },
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

  it("retries unknown photo upload with same key and bytes, waits for AVAILABLE, then sends a separate frozen receipt", async () => {
    const photoChecksum = "ab".repeat(32);
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn()
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000030")
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000031"),
      subtle: { digest: vi.fn(async () => new Uint8Array(32).fill(0xab).buffer) },
    } as unknown as Crypto);
    const activeSession = session("receiver", [
      "warehouse:read", "warehouse:write", "catalog:read", "document.upload", "document.read",
    ]);
    let lease = leaseFor(activeSession, 1);
    const state = signal({ status: "authenticated" as const, session: activeSession });
    const sessions = {
      state,
      captureSessionLease: () => lease,
      isSessionLeaseCurrent: (candidate: PlatformSessionLease) => candidate.epoch === lease.epoch,
    };
    const evidenceId = "00000000-0000-4000-8000-000000000020";
    const uploadedPhoto = new File(["photo-bytes"], "receiving.jpg", { type: "image/jpeg" });
    const evidenceResponse = (checksumSha256: string, lifecycleStatus: string) => ({
      id: evidenceId,
      subjectType: "WAREHOUSE",
      subjectId: warehouseId,
      lifecycleStatus,
      declaredContentType: "image/jpeg",
      detectedContentType: lifecycleStatus === "AVAILABLE" ? "image/jpeg" : null,
      originalFilename: "receiving.jpg",
      checksumSha256: lifecycleStatus === "AVAILABLE" ? checksumSha256 : null,
      byteSize: uploadedPhoto.size,
      createdAt: "2026-10-15T12:00:00Z",
      scannedAt: lifecycleStatus === "AVAILABLE" ? "2026-10-15T12:00:01Z" : null,
      failureCode: null,
      updatedAt: "2026-10-15T12:00:01Z",
      requestedByMembershipId: "membership-receiver",
    });
    const receive = vi.fn((request: ReceiveWarehouseStockRequest, _idempotencyKey: string) => of({
      body: {
        id: "00000000-0000-4000-8000-000000000021",
        warehouseId: request.warehouseId,
        zoneId: request.zoneId,
        catalogItemId: request.catalogItemId,
        batchNumber: request.batchNumber,
        expirationDate: request.expirationDate,
        receivedAt: request.receivedAt!,
        productionDate: request.productionDate!,
        onHand: request.quantity,
        reserved: 0,
        available: request.quantity,
        unit: request.unit,
        status: "AVAILABLE",
        version: 1,
        skuId: request.skuId ?? null,
      },
      etag: '"1"',
      status: 201,
    }));
    const inventory = {
      listWarehouses: vi.fn(() => of({ items: [{ id: warehouseId, code: "WH-1", name: "Warehouse 1", status: "ACTIVE", version: 1 }], page: 0, size: 100, total: 1 })),
      listZones: vi.fn(() => of({ items: [{ id: zoneId, warehouseId, code: "ZONE-1", name: "Zone 1", type: "COLD", temperatureMin: -2, temperatureMax: 8, status: "ACTIVE", version: 1 }], page: 0, size: 100, total: 1 })),
      listLots: vi.fn(() => of({ items: [], page: 0, size: 25, total: 0 })),
      receive,
    };
    const item = {
      catalogItemId: "CAT-001",
      productId: "PRODUCT-1",
      itemName: "Milk",
      sellableSkuId: "00000000-0000-4000-8000-000000000003",
      skuCode: "MILK-1L",
      unitOfMeasure: "kg",
      status: "ACTIVE",
    };
    const catalog = {
      filterOptions: vi.fn(() => of({ items: [], page: 0, size: 100, total: 0 })),
      listCatalog: vi.fn(() => of({ items: [item], page: 0, size: 25, totalItems: 1, totalPages: 1, sort: { field: "itemName", direction: "asc" } })),
      getCatalogItem: vi.fn(() => of(item)),
    };
    let store: PlatformInventoryReceivingStore;
    const uploadWarehouseEvidence = vi.fn();
    uploadWarehouseEvidence.mockReturnValueOnce(throwError(() => new NexaApiError("network", 0, null)));
    uploadWarehouseEvidence.mockImplementation((_warehouseId: string, _file: File, _key: string) => of({
      body: evidenceResponse(store.selectedEvidenceChecksum(), "SCANNING"),
      status: 201,
    }));
    const getEvidence = vi.fn(() => of(evidenceResponse(photoChecksum, "AVAILABLE")));
    const retries = { read: vi.fn(() => null), write: vi.fn(), remove: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PlatformInventoryReceivingStore,
        { provide: PlatformSessionStore, useValue: sessions },
        { provide: NexaWarehouseInventoryApi, useValue: inventory },
        { provide: NexaBuyerCatalogApi, useValue: catalog },
        { provide: NexaBusinessDocumentsApi, useValue: { uploadWarehouseEvidence, getEvidence } },
        { provide: NexaCommandRetryStore, useValue: retries },
      ],
    });
    store = TestBed.inject(PlatformInventoryReceivingStore);
    TestBed.flushEffects();
    await flushAsyncWork();
    await store.searchCatalog();
    store.setCatalogFilter(item as BuyerCatalogItemSummaryResponse);
    await flushAsyncWork();
    store.setWarehouse(warehouseId);
    await flushAsyncWork();
    store.setZone(zoneId);
    store.updateReceiptDraft({
      batchNumber: "PHOTO-BATCH-1",
      productionDate: "2026-10-10",
      receivedAtLocal: "2026-10-15T12:00",
      expirationDate: "2027-10-10",
      quantity: "5",
      temperatureReading: "12",
    });
    const selectingPhoto = store.selectEvidenceFile(uploadedPhoto);
    expect(store.receiptLocked()).toBe(true);
    await store.submitReceipt();
    expect(uploadWarehouseEvidence).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
    await selectingPhoto;
    expect(store.canReceive()).toBe(true);
    expect(store.canReadCatalog()).toBe(true);
    expect(store.canUploadEvidence()).toBe(true);
    expect(store.selectedCatalogItem()?.catalogItemId).toBe("CAT-001");
    expect(store.selectedEvidenceFile()?.name).toBe("receiving.jpg");
    expect(store.receiptDraft().warehouseId).toBe(warehouseId);
    expect(store.receiptDraft().zoneId).toBe(zoneId);

    await store.submitReceipt();

    expect(uploadWarehouseEvidence).toHaveBeenCalledTimes(1);
    expect(receive).not.toHaveBeenCalled();
    expect(store.pendingReceipt()).toBeNull();
    expect(store.pendingEvidenceUpload()?.evidenceId).toBeNull();
    const persistedUpload = retries.write.mock.calls[0]?.[1] as string;
    expect(persistedUpload).not.toContain("photo-bytes");
    expect(persistedUpload).toContain(photoChecksum);

    const sameBytesReselected = new File(["photo-bytes"], "receiving.jpg", { type: "image/jpeg" });
    await store.selectEvidenceFile(sameBytesReselected);
    expect(store.canRetryEvidenceUpload()).toBe(true);
    await store.retryPendingEvidenceUpload();

    expect(uploadWarehouseEvidence).toHaveBeenCalledTimes(2);
    expect(uploadWarehouseEvidence.mock.calls[1]?.[0]).toBe(uploadWarehouseEvidence.mock.calls[0]?.[0]);
    expect(uploadWarehouseEvidence.mock.calls[1]?.[2]).toBe(uploadWarehouseEvidence.mock.calls[0]?.[2]);
    expect(uploadWarehouseEvidence.mock.calls[1]?.[1]).not.toBe(uploadWarehouseEvidence.mock.calls[0]?.[1]);
    expect(store.availableEvidence()?.id).toBe(evidenceId);
    expect(receive).not.toHaveBeenCalled();

    await store.submitReceipt();

    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive.mock.calls[0]?.[0].temperatureEvidenceObjectId).toBe(evidenceId);
    expect(receive.mock.calls[0]?.[1]).not.toBe(uploadWarehouseEvidence.mock.calls[0]?.[2]);
    expect(store.pendingReceipt()).toBeNull();
    expect(store.availableEvidence()).toBeNull();
    const nextScope = session("receiver-next");
    await store.selectEvidenceFile(new File(["new-photo"], "next.jpg", { type: "image/jpeg" }));
    expect(store.selectedEvidenceFile()?.name).toBe("next.jpg");
    lease = leaseFor(nextScope, 2);
    state.set({ status: "authenticated", session: nextScope });
    TestBed.flushEffects();
    await flushAsyncWork();
    expect(store.selectedEvidenceFile()).toBeNull();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });
});
