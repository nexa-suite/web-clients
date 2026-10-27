import { DestroyRef, Injectable, computed, effect, inject, signal } from "@angular/core";
import {
  NexaApiError,
  NexaBusinessDocumentsApi,
  NexaBuyerCatalogApi,
  NexaCommandRetryStore,
  NexaWarehouseInventoryApi,
  BUSINESS_DOCUMENT_EVIDENCE_MAX_BYTES,
  type BusinessDocumentEvidenceResponse,
  type BuyerCatalogItemDetailResponse,
  type BuyerCatalogItemSummaryResponse,
  type BuyerCatalogPageResponse,
  type ReceiveWarehouseStockRequest,
  type WarehouseInventoryLotResponse,
  type WarehouseInventoryPageResponse,
  type WarehouseInventoryWarehouseResponse,
  type WarehouseInventoryZoneResponse,
} from "@nexa/api";
import { firstValueFrom, timer } from "rxjs";
import { canAccessPlatformFeature, PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { PlatformSessionStore, type PlatformSessionLease } from "../../tenant-access-governance/application/public-api";

const PAGE_SIZE = 25;
const REFERENCE_PAGE_SIZE = 100;
const RECEIPT_RETRY_PREFIX = "nexa:platform:inventory-receipt:";
const EVIDENCE_RETRY_PREFIX = "nexa:platform:inventory-evidence:";
const PENDING_EVIDENCE_STATUSES = new Set(["REQUESTED", "UPLOADING", "QUARANTINED", "SCANNING"]);

interface StockFilters {
  readonly warehouseId: string;
  readonly zoneId: string;
  readonly catalogItemId: string;
  readonly status: string;
}

export interface WarehouseReceiptDraft {
  readonly batchNumber: string;
  readonly productionDate: string;
  readonly receivedAtLocal: string;
  readonly expirationDate: string;
  readonly quantity: string;
  readonly temperatureReading: string;
  readonly notes: string;
  readonly warehouseId: string;
  readonly zoneId: string;
  readonly catalogItemId: string;
  readonly skuId: string | null;
  readonly unit: string;
}

interface PendingReceipt {
  readonly idempotencyKey: string;
  readonly request: ReceiveWarehouseStockRequest & {
    readonly productionDate: string;
    readonly receivedAt: string;
    readonly temperatureReading: number | null;
    readonly notes: string | null;
    readonly skuId: string | null;
  };
  readonly storageKey: string;
}

interface PendingEvidenceUpload {
  readonly idempotencyKey: string;
  readonly warehouseId: string;
  readonly originalFilename: string;
  readonly declaredContentType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly evidenceId: string | null;
  readonly storageKey: string;
}

const EMPTY_FILTERS: StockFilters = {
  warehouseId: "",
  zoneId: "",
  catalogItemId: "",
  status: "",
};

const EMPTY_DRAFT: WarehouseReceiptDraft = {
  batchNumber: "",
  productionDate: "",
  receivedAtLocal: "",
  expirationDate: "",
  quantity: "",
  temperatureReading: "",
  notes: "",
  warehouseId: "",
  zoneId: "",
  catalogItemId: "",
  skuId: null,
  unit: "",
};

/** Coordinates scoped warehouse reads and an idempotent, server-authoritative receipt command. */
@Injectable()
export class PlatformInventoryReceivingStore {
  private readonly inventory = inject(NexaWarehouseInventoryApi);
  private readonly businessDocuments = inject(NexaBusinessDocumentsApi);
  private readonly catalog = inject(NexaBuyerCatalogApi);
  private readonly retries = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private generation = 0;
  private zonesGeneration = 0;
  private lotsGeneration = 0;
  private catalogGeneration = 0;
  private observedContext = "";

  readonly filters = signal<StockFilters>(EMPTY_FILTERS);
  readonly receiptDraft = signal<WarehouseReceiptDraft>(EMPTY_DRAFT);
  readonly warehouses = signal<readonly WarehouseInventoryWarehouseResponse[]>([]);
  readonly zones = signal<readonly WarehouseInventoryZoneResponse[]>([]);
  readonly lotsPage = signal<WarehouseInventoryPageResponse<WarehouseInventoryLotResponse> | null>(null);
  readonly catalogPage = signal<BuyerCatalogPageResponse | null>(null);
  readonly selectedCatalogItem = signal<BuyerCatalogItemDetailResponse | null>(null);
  readonly brandOptions = signal<readonly { readonly id: string; readonly name: string }[]>([]);
  readonly categoryOptions = signal<readonly { readonly id: string; readonly name: string }[]>([]);
  readonly catalogQuery = signal("");
  readonly selectedBrand = signal("");
  readonly selectedCategory = signal("");
  readonly pendingReceipt = signal<PendingReceipt | null>(null);
  readonly selectedEvidenceFile = signal<File | null>(null);
  readonly selectedEvidenceChecksum = signal("");
  readonly pendingEvidenceUpload = signal<PendingEvidenceUpload | null>(null);
  readonly evidenceStatus = signal<BusinessDocumentEvidenceResponse | null>(null);
  readonly availableEvidence = signal<BusinessDocumentEvidenceResponse | null>(null);
  readonly warehousesLoading = signal(false);
  readonly zonesLoading = signal(false);
  readonly lotsLoading = signal(false);
  readonly catalogLoading = signal(false);
  readonly filterOptionsLoading = signal(false);
  readonly receiving = signal(false);
  readonly evidenceFileHashing = signal(false);
  readonly evidenceLoading = signal(false);
  readonly evidenceError = signal("");
  readonly evidenceNotice = signal("");
  readonly warehouseError = signal("");
  readonly zonesError = signal("");
  readonly lotsError = signal("");
  readonly catalogError = signal("");
  readonly filterOptionsError = signal("");
  readonly receiptError = signal("");
  readonly receiptNotice = signal("");

  readonly canRead = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" &&
      canAccessPlatformFeature(current.session, PLATFORM_ACCESS_RULES.inventory);
  });

  readonly canReceive = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" && this.canRead() &&
      canAccessPlatformFeature(current.session, PLATFORM_ACCESS_RULES.inventoryReceive);
  });

  readonly canReadCatalog = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" &&
      canAccessPlatformFeature(current.session, PLATFORM_ACCESS_RULES.inventoryCatalog);
  });

  readonly canUploadEvidence = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" && this.canReceive() &&
      canAccessPlatformFeature(current.session, PLATFORM_ACCESS_RULES.inventoryEvidenceUpload);
  });

  readonly receiptLocked = computed(() => this.receiving() || this.evidenceFileHashing() || this.pendingReceipt() !== null ||
    (this.pendingEvidenceUpload() !== null && this.availableEvidence() === null));

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.generation += 1;
      this.zonesGeneration += 1;
      this.lotsGeneration += 1;
      this.catalogGeneration += 1;
      this.selectedEvidenceFile.set(null);
    });
    effect(() => {
      const current = this.sessions.state();
      const lease = this.sessions.captureSessionLease();
      const permissions = current.status === "authenticated"
        ? [...(current.session.membership?.permissions ?? [])].sort().join(",")
        : "";
      const contextKey = lease
        ? `${lease.epoch}:${lease.scope.userId}:${lease.scope.tenantId}:${lease.scope.workspaceId}:${lease.scope.membershipId}:${permissions}`
        : `no-lease:${current.status}:${permissions}`;
      if (contextKey === this.observedContext) return;
      this.observedContext = contextKey;
      const generation = ++this.generation;
      this.zonesGeneration += 1;
      this.lotsGeneration += 1;
      this.catalogGeneration += 1;
      this.resetContextState();
      if (!lease || !this.canRead()) return;

      const pendingEvidence = this.restorePendingEvidence(lease);
      const pending = this.restorePendingReceipt(lease);
      void this.loadWarehouses(
        lease,
        generation,
        pending?.request.warehouseId ?? pendingEvidence?.warehouseId ?? "",
      );
      void this.loadLots(0, lease, generation);
      if (this.canReadCatalog()) void this.loadFilterOptions(lease, generation);
    });
  }

  setWarehouse(warehouseId: string): void {
    if (!this.canEditFilters()) return;
    const evidence = this.availableEvidence();
    if (evidence && evidence.subjectId !== warehouseId) {
      this.evidenceError.set("Remove the current warehouse photo before changing warehouse.");
      return;
    }
    const warehouse = this.warehouses().find((item) => item.id === warehouseId);
    if (warehouseId && !warehouse) return;
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    this.filters.update((current) => ({ ...current, warehouseId, zoneId: "" }));
    this.receiptDraft.update((current) => ({ ...current, warehouseId, zoneId: "" }));
    if (!warehouseId) {
      this.zonesGeneration += 1;
      this.zonesLoading.set(false);
    }
    this.zones.set([]);
    this.zonesError.set("");
    if (warehouseId) void this.loadZones(warehouseId, lease, this.generation);
    void this.loadLots(0, lease, this.generation);
  }

  setZone(zoneId: string): void {
    if (!this.canEditFilters()) return;
    const warehouseId = this.filters().warehouseId;
    const zone = this.zones().find((item) => item.id === zoneId && item.warehouseId === warehouseId);
    if (zoneId && !zone) return;
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    this.filters.update((current) => ({ ...current, zoneId }));
    this.receiptDraft.update((current) => ({ ...current, zoneId }));
    void this.loadLots(0, lease, this.generation);
  }

  setStatus(status: string): void {
    const allowed = new Set(["", "AVAILABLE", "BLOCKED", "QUARANTINED", "HOLD", "EXPIRED", "DEPLETED"]);
    if (!allowed.has(status) || !this.canEditFilters()) return;
    this.filters.update((current) => ({ ...current, status }));
    const lease = this.sessions.captureSessionLease();
    if (lease) void this.loadLots(0, lease, this.generation);
  }

  setCatalogFilter(item: BuyerCatalogItemSummaryResponse | null): void {
    if (!this.canEditFilters() || !this.canReadCatalog()) return;
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    if (!item) {
      this.selectedCatalogItem.set(null);
      this.filters.update((current) => ({ ...current, catalogItemId: "" }));
      this.receiptDraft.update((current) => ({ ...current, catalogItemId: "", skuId: null, unit: "" }));
      void this.loadLots(0, lease, this.generation);
      return;
    }
    const listed = this.catalogPage()?.items.some((candidate) => candidate.catalogItemId === item.catalogItemId);
    if (!listed) return;
    this.selectedCatalogItem.set(null);
    this.filters.update((current) => ({ ...current, catalogItemId: "" }));
    this.receiptDraft.update((current) => ({ ...current, catalogItemId: "", skuId: null, unit: "" }));
    const request = ++this.catalogGeneration;
    this.catalogLoading.set(true);
    this.catalogError.set("");
    void firstValueFrom(this.catalog.getCatalogItem(item.catalogItemId))
      .then((detail) => {
        if (!this.isCurrent(lease, this.generation) || request !== this.catalogGeneration) return;
        if (
          detail.catalogItemId !== item.catalogItemId ||
          detail.skuCode !== item.skuCode ||
          detail.status !== "ACTIVE" ||
          !detail.unitOfMeasure?.trim()
        ) {
          throw new Error("The selected catalog item is incomplete or inactive.");
        }
        this.selectedCatalogItem.set(detail);
        this.filters.update((current) => ({ ...current, catalogItemId: detail.catalogItemId }));
        this.receiptDraft.update((current) => ({
          ...current,
          catalogItemId: detail.catalogItemId,
          skuId: null,
          unit: detail.unitOfMeasure?.trim() ?? "",
        }));
        void this.loadLots(0, lease, this.generation);
      })
      .catch((error: unknown) => {
        if (this.isCurrent(lease, this.generation) && request === this.catalogGeneration) {
          this.selectedCatalogItem.set(null);
          this.catalogError.set(catalogDetailError(error));
        }
      })
      .finally(() => {
        if (this.isCurrent(lease, this.generation) && request === this.catalogGeneration) {
          this.catalogLoading.set(false);
        }
      });
  }

  updateReceiptDraft(patch: Partial<WarehouseReceiptDraft>): void {
    if (!this.canEditReceipt()) return;
    this.receiptDraft.update((current) => ({ ...current, ...patch }));
    this.receiptError.set("");
    this.receiptNotice.set("");
  }

  async selectEvidenceFile(file: File | null): Promise<void> {
    if (!file || !this.canUploadEvidence() || this.receiving() || this.pendingReceipt()) return;
    const currentUpload = this.pendingEvidenceUpload();
    if (currentUpload?.evidenceId || this.availableEvidence()) {
      this.evidenceError.set("Remove the current warehouse photo before selecting another file.");
      return;
    }
    const mimeType = file.type.trim();
    if (
      file.size <= 0 || file.size > BUSINESS_DOCUMENT_EVIDENCE_MAX_BYTES ||
      !mimeType.toLowerCase().startsWith("image/") || mimeType.length > 160 ||
      !file.name.trim() || file.name.length > 255 || /[\u0000-\u001f\u007f]/.test(file.name)
    ) {
      this.selectedEvidenceFile.set(null);
      this.selectedEvidenceChecksum.set("");
      this.evidenceError.set("Choose a non-empty image within the API file-size limit.");
      return;
    }
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    const generation = this.generation;
    this.evidenceFileHashing.set(true);
    this.evidenceError.set("");
    this.evidenceNotice.set("");
    try {
      const checksumSha256 = await hashEvidenceFile(file);
      if (!this.isCurrent(lease, generation)) return;
      if (currentUpload && !matchesEvidenceFile(currentUpload, file, checksumSha256)) {
        this.selectedEvidenceFile.set(null);
        this.selectedEvidenceChecksum.set("");
        this.evidenceError.set("Select the exact same photo to retry the upload whose outcome is unknown.");
        return;
      }
      this.selectedEvidenceFile.set(file);
      this.selectedEvidenceChecksum.set(checksumSha256);
    } catch {
      if (this.isCurrent(lease, generation)) {
        this.selectedEvidenceFile.set(null);
        this.selectedEvidenceChecksum.set("");
        this.evidenceError.set("This browser could not verify the photo bytes. No upload was sent.");
      }
    } finally {
      if (this.isCurrent(lease, generation)) this.evidenceFileHashing.set(false);
    }
  }

  removeSelectedEvidence(): void {
    if (this.receiving() || this.evidenceFileHashing() || this.pendingReceipt()) return;
    const pending = this.pendingEvidenceUpload();
    if (pending && !this.availableEvidence()) return;
    if (pending) this.retries.remove(pending.storageKey);
    this.clearEvidenceState(false);
    this.evidenceNotice.set("Photo removed from this receipt draft.");
  }

  async retryPendingEvidenceUpload(): Promise<void> {
    const pending = this.pendingEvidenceUpload();
    const lease = this.sessions.captureSessionLease();
    if (!pending || !lease || !this.canUploadEvidence() || this.receiving() || this.pendingReceipt()) return;
    if (!pending.evidenceId && !this.selectedEvidenceMatches(pending)) {
      this.evidenceError.set("Select the exact same photo before retrying this upload.");
      return;
    }
    const generation = this.generation;
    this.receiving.set(true);
    this.evidenceError.set("");
    try {
      await this.ensureEvidenceAvailable(pending, lease, generation);
    } catch (error: unknown) {
      if (this.isCurrent(lease, generation)) this.handleEvidenceError(error);
    } finally {
      if (this.isCurrent(lease, generation)) this.receiving.set(false);
    }
  }

  canRetryEvidenceUpload(): boolean {
    const pending = this.pendingEvidenceUpload();
    return Boolean(
      pending && this.canUploadEvidence() && !this.receiving() && !this.pendingReceipt() &&
      (pending.evidenceId !== null || this.selectedEvidenceMatches(pending)),
    );
  }

  updateCatalogSearch(query: string, brand: string, category: string): void {
    if (!this.canEditFilters() || !this.canReadCatalog()) return;
    this.catalogQuery.set(query);
    this.selectedBrand.set(brand);
    this.selectedCategory.set(category);
  }

  async searchCatalog(page = 0): Promise<void> {
    if (!this.canReadCatalog() || !this.canEditFilters()) return;
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    const generation = this.generation;
    const requestVersion = ++this.catalogGeneration;
    this.catalogLoading.set(true);
    this.catalogError.set("");
    try {
      const result = await firstValueFrom(this.catalog.listCatalog({
        q: this.catalogQuery().trim(),
        brand: this.selectedBrand(),
        category: this.selectedCategory(),
        page,
        size: PAGE_SIZE,
        sort: "itemName",
        direction: "asc",
      }));
      if (!this.isCurrent(lease, generation) || requestVersion !== this.catalogGeneration) return;
      if (!validCatalogPage(result, page)) throw new Error("Catalog page metadata is invalid.");
      this.catalogPage.set(result);
    } catch (error: unknown) {
      if (this.isCurrent(lease, generation) && requestVersion === this.catalogGeneration) {
        this.catalogPage.set(null);
        this.catalogError.set(readErrorMessage(error, "Catalog items could not be loaded."));
      }
    } finally {
      if (this.isCurrent(lease, generation) && requestVersion === this.catalogGeneration) {
        this.catalogLoading.set(false);
      }
    }
  }

  async changeLotsPage(offset: number): Promise<void> {
    const page = this.lotsPage();
    if (!page || !Number.isSafeInteger(offset) || this.lotsLoading()) return;
    const lastPage = Math.max(0, Math.ceil(page.total / page.size) - 1);
    const nextPage = page.page + offset;
    if (nextPage < 0 || nextPage > lastPage) return;
    const lease = this.sessions.captureSessionLease();
    if (lease) await this.loadLots(nextPage, lease, this.generation);
  }

  async changeCatalogPage(offset: number): Promise<void> {
    const page = this.catalogPage();
    if (!page || !Number.isSafeInteger(offset) || this.catalogLoading()) return;
    const nextPage = page.page + offset;
    if (nextPage < 0 || nextPage >= page.totalPages) return;
    await this.searchCatalog(nextPage);
  }

  async refreshLots(): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease || !this.canRead()) return;
    await this.loadLots(this.lotsPage()?.page ?? 0, lease, this.generation);
  }

  refreshLotsForPolling(lease: PlatformSessionLease): Promise<boolean> {
    if (!this.isCurrent(lease, this.generation) || !this.canRead()) return Promise.resolve(false);
    return this.loadLots(this.lotsPage()?.page ?? 0, lease, this.generation);
  }

  async submitReceipt(): Promise<void> {
    if (this.pendingReceipt()) {
      await this.retryPendingReceipt();
      return;
    }
    if (!this.canReceive() || !this.canReadCatalog() || !this.canEditReceipt()) return;
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    let request = this.buildReceiptRequest();
    if (!request) return;
    const generation = this.generation;
    this.receiving.set(true);
    this.receiptError.set("");
    this.evidenceError.set("");
    this.receiptNotice.set("");
    try {
      let evidence = this.availableEvidence();
      const pendingUpload = this.pendingEvidenceUpload();
      if (pendingUpload) {
        evidence = await this.ensureEvidenceAvailable(pendingUpload, lease, generation);
      } else if (this.selectedEvidenceFile()) {
        if (!this.canUploadEvidence()) {
          throw new Error("Photo upload is not available to this membership.");
        }
        const upload = this.createPendingEvidenceUpload(lease, request.warehouseId);
        if (!upload) return;
        evidence = await this.ensureEvidenceAvailable(upload, lease, generation);
      }
      if (!this.isCurrent(lease, generation)) return;
      if (evidence) {
        if (evidence.subjectType !== "WAREHOUSE" || evidence.subjectId !== request.warehouseId) {
          throw new Error("Photo evidence is not bound to the selected warehouse.");
        }
        request = { ...request, temperatureEvidenceObjectId: evidence.id };
      }
      const pending = this.createPendingReceipt(lease, request);
      if (!pending) return;
      await this.sendReceipt(pending, lease, generation);
    } catch (error: unknown) {
      if (this.isCurrent(lease, generation)) this.handleEvidenceError(error);
    } finally {
      if (this.isCurrent(lease, generation)) this.receiving.set(false);
    }
  }

  private buildReceiptRequest(): PendingReceipt["request"] | null {
    const draft = this.receiptDraft();
    const warehouse = this.warehouses().find((item) => item.id === draft.warehouseId);
    const zone = this.zones().find((item) => item.id === draft.zoneId && item.warehouseId === draft.warehouseId);
    const item = this.selectedCatalogItem();
    const quantity = Number(draft.quantity);
    const temperature = draft.temperatureReading.trim() ? Number(draft.temperatureReading) : null;
    const receivedAt = parseLocalDateTime(draft.receivedAtLocal);
    if (
      !warehouse || warehouse.status !== "ACTIVE" ||
      !zone || zone.status !== "ACTIVE" ||
      !item || item.catalogItemId !== draft.catalogItemId ||
      !item.unitOfMeasure?.trim() || item.unitOfMeasure.trim() !== draft.unit ||
      !draft.batchNumber.trim() || !draft.productionDate || !draft.expirationDate ||
      !Number.isFinite(quantity) || quantity <= 0 || !receivedAt ||
      (draft.temperatureReading.trim() && !Number.isFinite(temperature)) ||
      draft.notes.length > 2000
    ) {
      this.receiptError.set("Complete active warehouse and zone, catalog item, lot, dates, positive quantity and SKU unit.");
      return null;
    }
    return {
      warehouseId: warehouse.id,
      zoneId: zone.id,
      catalogItemId: item.catalogItemId,
      batchNumber: draft.batchNumber.trim(),
      expirationDate: draft.expirationDate,
      productionDate: draft.productionDate,
      receivedAt,
      quantity,
      unit: item.unitOfMeasure.trim(),
      temperatureReading: temperature,
      notes: draft.notes.trim() || null,
      skuId: null,
    };
  }

  private createPendingReceipt(
    lease: PlatformSessionLease,
    request: PendingReceipt["request"],
  ): PendingReceipt | null {
    const storageKey = receiptStorageKey(lease);
    const idempotencyKey = globalThis.crypto?.randomUUID?.();
    if (!idempotencyKey) {
      this.receiptError.set("This browser cannot create a safe receipt retry key. No request was sent.");
      return null;
    }
    const pending: PendingReceipt = { idempotencyKey, request, storageKey };
    try {
      this.retries.write(storageKey, JSON.stringify({ idempotencyKey, request }));
    } catch {
      this.receiptError.set("The receipt could not be saved for safe retry. No request was sent.");
      return null;
    }
    this.pendingReceipt.set(pending);
    this.receiptError.set("");
    return pending;
  }

  async retryPendingReceipt(): Promise<void> {
    const pending = this.pendingReceipt();
    const lease = this.sessions.captureSessionLease();
    if (!pending || !lease || !this.canReceive() || this.receiving()) return;
    await this.sendReceipt(pending, lease, this.generation);
  }

  private createPendingEvidenceUpload(
    lease: PlatformSessionLease,
    warehouseId: string,
  ): PendingEvidenceUpload | null {
    const file = this.selectedEvidenceFile();
    const checksumSha256 = this.selectedEvidenceChecksum();
    if (!file || !checksumSha256 || !this.canUploadEvidence()) {
      this.evidenceError.set("Select a photo and confirm document upload access before receiving.");
      return null;
    }
    const idempotencyKey = globalThis.crypto?.randomUUID?.();
    if (!idempotencyKey) {
      this.evidenceError.set("This browser cannot create a safe photo retry key. No upload was sent.");
      return null;
    }
    const storageKey = evidenceStorageKey(lease);
    const pending: PendingEvidenceUpload = {
      idempotencyKey,
      warehouseId,
      originalFilename: file.name,
      declaredContentType: file.type.trim(),
      byteSize: file.size,
      checksumSha256,
      evidenceId: null,
      storageKey,
    };
    try {
      this.persistPendingEvidence(pending);
    } catch {
      this.evidenceError.set("Photo retry details could not be saved safely. No upload was sent.");
      return null;
    }
    this.pendingEvidenceUpload.set(pending);
    this.evidenceStatus.set(null);
    this.availableEvidence.set(null);
    this.evidenceNotice.set("");
    return pending;
  }

  private async ensureEvidenceAvailable(
    pending: PendingEvidenceUpload,
    lease: PlatformSessionLease,
    generation: number,
  ): Promise<BusinessDocumentEvidenceResponse | null> {
    let current = this.pendingEvidenceUpload() ?? pending;
    if (this.availableEvidence()) return this.availableEvidence();
    if (!current.evidenceId) {
      const file = this.selectedEvidenceFile();
      const checksum = this.selectedEvidenceChecksum();
      if (!file || !matchesEvidenceFile(current, file, checksum)) {
        throw new Error("Select the exact same photo before retrying this upload.");
      }
      const response = await firstValueFrom(this.businessDocuments.uploadWarehouseEvidence(
        current.warehouseId,
        file,
        current.idempotencyKey,
      ));
      if (!this.isCurrent(lease, generation)) return null;
      const evidence = normalizeBusinessDocumentEvidence(response.body);
      if (response.status !== 201 || !evidence || !matchesEvidenceIdentity(evidence, current, null)) {
        throw new Error("The API response did not confirm the expected warehouse photo upload.");
      }
      current = { ...current, evidenceId: evidence.id };
      this.pendingEvidenceUpload.set(current);
      this.evidenceStatus.set(evidence);
      this.persistPendingEvidence(current);
      const available = this.applyEvidenceStatus(evidence, current);
      if (available) return available;
    }
    const evidenceId = current.evidenceId;
    if (!evidenceId) throw new Error("Photo upload did not return an evidence identifier.");
    return this.pollEvidence(current, lease, generation, evidenceId);
  }

  private async pollEvidence(
    pending: PendingEvidenceUpload,
    lease: PlatformSessionLease,
    generation: number,
    evidenceId: string,
  ): Promise<BusinessDocumentEvidenceResponse | null> {
    let delayMs = 750;
    this.evidenceLoading.set(true);
    try {
      while (this.isCurrent(lease, generation)) {
        await firstValueFrom(timer(delayMs));
        if (!this.isCurrent(lease, generation)) return null;
        const response = await firstValueFrom(this.businessDocuments.getEvidence(evidenceId));
        if (!this.isCurrent(lease, generation)) return null;
        const evidence = normalizeBusinessDocumentEvidence(response);
        if (!evidence) throw new Error("The API evidence response is invalid.");
        const available = this.applyEvidenceStatus(evidence, pending);
        if (available) return available;
        delayMs = Math.min(delayMs * 2, 15_000);
      }
      return null;
    } finally {
      if (this.isCurrent(lease, generation)) this.evidenceLoading.set(false);
    }
  }

  private applyEvidenceStatus(
    response: BusinessDocumentEvidenceResponse,
    pending: PendingEvidenceUpload,
  ): BusinessDocumentEvidenceResponse | null {
    if (!matchesEvidenceIdentity(response, pending, pending.evidenceId)) {
      throw new Error("The API evidence does not match the selected warehouse photo.");
    }
    this.evidenceStatus.set(response);
    if (response.lifecycleStatus === "AVAILABLE") {
      if (
        !response.detectedContentType?.toLowerCase().startsWith("image/") ||
        response.checksumSha256?.toLowerCase() !== pending.checksumSha256 ||
        response.byteSize !== pending.byteSize
      ) {
        this.clearEvidenceState(true);
        throw new Error("The API did not confirm an available image matching the uploaded bytes.");
      }
      this.availableEvidence.set(response);
      this.evidenceError.set("");
      this.evidenceNotice.set("Photo scan is available for the selected warehouse. The API does not verify what the photo depicts.");
      return response;
    }
    if (response.lifecycleStatus === "REJECTED" || response.lifecycleStatus === "DELETED") {
      this.clearEvidenceState(true);
      throw new Error("The API did not make this photo available. Choose another image or contact Operations.");
    }
    if (!PENDING_EVIDENCE_STATUSES.has(response.lifecycleStatus)) {
      throw new Error("The API returned an unsupported photo status. Receipt remains blocked.");
    }
    return null;
  }

  private persistPendingEvidence(pending: PendingEvidenceUpload): void {
    this.retries.writeInventoryEvidence(
      pending.storageKey,
      JSON.stringify({
        idempotencyKey: pending.idempotencyKey,
        warehouseId: pending.warehouseId,
        originalFilename: pending.originalFilename,
        declaredContentType: pending.declaredContentType,
        byteSize: pending.byteSize,
        checksumSha256: pending.checksumSha256,
        evidenceId: pending.evidenceId,
      }),
      BUSINESS_DOCUMENT_EVIDENCE_MAX_BYTES,
    );
  }

  private restorePendingEvidence(lease: PlatformSessionLease): PendingEvidenceUpload | null {
    const storageKey = evidenceStorageKey(lease);
    const stored = this.retries.readInventoryEvidence(
      storageKey,
      BUSINESS_DOCUMENT_EVIDENCE_MAX_BYTES,
    );
    if (!stored) return null;
    try {
      const value = JSON.parse(stored) as Omit<PendingEvidenceUpload, "storageKey">;
      if (
        !isUuid(value.idempotencyKey) || !isUuid(value.warehouseId) ||
        !isBoundedText(value.originalFilename, 255) ||
        !isBoundedText(value.declaredContentType, 160) ||
        !value.declaredContentType.toLowerCase().startsWith("image/") ||
        !Number.isSafeInteger(value.byteSize) || value.byteSize <= 0 ||
        value.byteSize > BUSINESS_DOCUMENT_EVIDENCE_MAX_BYTES ||
        !/^[a-f0-9]{64}$/.test(value.checksumSha256) ||
        (value.evidenceId !== null && !isUuid(value.evidenceId))
      ) {
        throw new Error("Stored photo retry details are invalid.");
      }
      const pending: PendingEvidenceUpload = { ...value, storageKey };
      this.pendingEvidenceUpload.set(pending);
      this.filters.update((current) => ({ ...current, warehouseId: pending.warehouseId }));
      this.receiptDraft.update((current) => ({ ...current, warehouseId: pending.warehouseId }));
      return pending;
    } catch {
      this.retries.remove(storageKey);
      return null;
    }
  }

  private selectedEvidenceMatches(pending: PendingEvidenceUpload): boolean {
    const file = this.selectedEvidenceFile();
    return file !== null && matchesEvidenceFile(pending, file, this.selectedEvidenceChecksum());
  }

  private handleEvidenceError(error: unknown): void {
    if (error instanceof NexaApiError && ["unauthenticated", "forbidden", "not-found"].includes(error.kind)) {
      this.clearEvidenceState(true);
      this.evidenceError.set("Photo access or warehouse scope changed. Confirm the active warehouse and select the photo again.");
      return;
    }
    if (error instanceof NexaApiError && error.kind === "validation") {
      this.clearEvidenceState(true);
      this.evidenceError.set("The API rejected the photo. Choose a supported image and retry.");
      return;
    }
    if (error instanceof NexaApiError && ["network", "timeout", "server", "rate-limited"].includes(error.kind)) {
      this.evidenceError.set("Photo upload or status is unknown. Keep or reselect the exact same photo, then retry.");
      return;
    }
    this.evidenceError.set(error instanceof Error ? error.message : "Photo evidence was not confirmed.");
  }

  private clearEvidenceState(removeStored: boolean): void {
    const pending = this.pendingEvidenceUpload();
    if (removeStored && pending) this.retries.remove(pending.storageKey);
    this.selectedEvidenceFile.set(null);
    this.selectedEvidenceChecksum.set("");
    this.pendingEvidenceUpload.set(null);
    this.evidenceStatus.set(null);
    this.availableEvidence.set(null);
    this.evidenceLoading.set(false);
    this.evidenceError.set("");
    this.evidenceNotice.set("");
  }

  private async loadWarehouses(
    lease: PlatformSessionLease,
    generation: number,
    pendingWarehouseId: string,
  ): Promise<void> {
    this.warehousesLoading.set(true);
    this.warehouseError.set("");
    try {
      const warehouses = await readAllPages(
        (page) => firstValueFrom(this.inventory.listWarehouses(page, REFERENCE_PAGE_SIZE)),
      );
      if (!this.isCurrent(lease, generation)) return;
      if (!warehouses.every(isWarehouse)) throw new Error("Warehouse response is invalid.");
      this.warehouses.set(warehouses);
      const targetWarehouseId = pendingWarehouseId || this.filters().warehouseId;
      if (targetWarehouseId && warehouses.some((item) => item.id === targetWarehouseId)) {
        void this.loadZones(targetWarehouseId, lease, generation);
      }
    } catch (error: unknown) {
      if (this.isCurrent(lease, generation)) {
        this.warehouses.set([]);
        this.warehouseError.set(readErrorMessage(error, "Authorized warehouses could not be loaded."));
      }
    } finally {
      if (this.isCurrent(lease, generation)) this.warehousesLoading.set(false);
    }
  }

  private async loadZones(
    warehouseId: string,
    lease: PlatformSessionLease,
    generation: number,
  ): Promise<void> {
    const requestVersion = ++this.zonesGeneration;
    this.zonesLoading.set(true);
    this.zonesError.set("");
    try {
      const zones = await readAllPages(
        (page) => firstValueFrom(this.inventory.listZones(warehouseId, page, REFERENCE_PAGE_SIZE)),
      );
      if (!this.isCurrent(lease, generation) || requestVersion !== this.zonesGeneration) return;
      if (!zones.every((zone) => isZone(zone) && zone.warehouseId === warehouseId)) {
        throw new Error("Warehouse zone response is invalid.");
      }
      this.zones.set(zones);
      const selectedZoneId = this.filters().zoneId;
      if (selectedZoneId && !zones.some((zone) => zone.id === selectedZoneId)) {
        this.filters.update((current) => ({ ...current, zoneId: "" }));
        this.receiptDraft.update((current) => ({ ...current, zoneId: "" }));
      }
    } catch (error: unknown) {
      if (this.isCurrent(lease, generation) && requestVersion === this.zonesGeneration) {
        this.zones.set([]);
        this.zonesError.set(readErrorMessage(error, "Zones for this warehouse could not be loaded."));
      }
    } finally {
      if (this.isCurrent(lease, generation) && requestVersion === this.zonesGeneration) {
        this.zonesLoading.set(false);
      }
    }
  }

  private async loadLots(page: number, lease: PlatformSessionLease, generation: number): Promise<boolean> {
    if (!this.canRead()) return false;
    const requestVersion = ++this.lotsGeneration;
    this.lotsLoading.set(true);
    this.lotsError.set("");
    const filters = this.filters();
    try {
      const result = await firstValueFrom(this.inventory.listLots({
        page,
        size: PAGE_SIZE,
        catalogItemId: filters.catalogItemId || undefined,
        warehouseId: filters.warehouseId || undefined,
        zoneId: filters.zoneId || undefined,
        status: filters.status || undefined,
      }));
      if (!this.isCurrent(lease, generation) || requestVersion !== this.lotsGeneration) return false;
      if (!validWarehousePage(result, page, PAGE_SIZE) || !result.items.every(isLot)) {
        throw new Error("Inventory page metadata is invalid.");
      }
      this.lotsPage.set(result);
      return true;
    } catch (error: unknown) {
      if (this.isCurrent(lease, generation) && requestVersion === this.lotsGeneration) {
        this.lotsPage.set(null);
        this.lotsError.set(readErrorMessage(error, "Stock lots could not be loaded."));
      }
      return !(error instanceof NexaApiError && ["unauthenticated", "forbidden", "not-found"].includes(error.kind));
    } finally {
      if (this.isCurrent(lease, generation) && requestVersion === this.lotsGeneration) {
        this.lotsLoading.set(false);
      }
    }
  }

  private async loadFilterOptions(lease: PlatformSessionLease, generation: number): Promise<void> {
    this.filterOptionsLoading.set(true);
    this.filterOptionsError.set("");
    try {
      const [brands, categories] = await Promise.all([
        readAllPages((page) => firstValueFrom(this.catalog.filterOptions("brand", "", page, REFERENCE_PAGE_SIZE))),
        readAllPages((page) => firstValueFrom(this.catalog.filterOptions("category", "", page, REFERENCE_PAGE_SIZE))),
      ]);
      if (!this.isCurrent(lease, generation)) return;
      if (![...brands, ...categories].every(isNamedOption)) throw new Error("Catalog filter options are invalid.");
      this.brandOptions.set(brands);
      this.categoryOptions.set(categories);
    } catch (error: unknown) {
      if (this.isCurrent(lease, generation)) {
        this.brandOptions.set([]);
        this.categoryOptions.set([]);
        this.filterOptionsError.set(readErrorMessage(error, "Catalog brand and category filters could not be loaded."));
      }
    } finally {
      if (this.isCurrent(lease, generation)) this.filterOptionsLoading.set(false);
    }
  }

  private async sendReceipt(
    pending: PendingReceipt,
    lease: PlatformSessionLease,
    generation: number,
  ): Promise<void> {
    if (!this.canReceive() || !this.sessions.isSessionLeaseCurrent(lease)) return;
    const ownsBusyState = !this.receiving();
    if (ownsBusyState) this.receiving.set(true);
    this.receiptError.set("");
    this.receiptNotice.set("");
    try {
      const response = await firstValueFrom(this.inventory.receive(pending.request, pending.idempotencyKey));
      if (!this.isCurrent(lease, generation)) return;
      if (
        response.status !== 201 ||
        !response.etag?.trim() ||
        !matchesReceipt(response.body, pending.request)
      ) {
        throw new Error("The API response did not confirm the expected receipt resource and version.");
      }
      this.retries.remove(pending.storageKey);
      this.pendingReceipt.set(null);
      this.clearEvidenceState(true);
      this.receiptDraft.update((current) => ({
        ...current,
        batchNumber: "",
        productionDate: "",
        receivedAtLocal: "",
        expirationDate: "",
        quantity: "",
        temperatureReading: "",
        notes: "",
      }));
      this.receiptNotice.set(`Receipt recorded. Lot ${response.body.id} is now in stock.`);
      await this.loadLots(0, lease, generation);
    } catch (error: unknown) {
      if (!this.isCurrent(lease, generation)) return;
      const code = error instanceof NexaApiError ? error.problem?.code : undefined;
      if (error instanceof NexaApiError && error.kind === "validation") {
        this.retries.remove(pending.storageKey);
        this.pendingReceipt.set(null);
        if (code === "BUSINESS_EVIDENCE_NOT_AVAILABLE" && this.availableEvidence()) {
          this.clearEvidenceState(true);
        }
      }
      this.receiptError.set(receiptErrorMessage(error, code));
    } finally {
      if (ownsBusyState && this.isCurrent(lease, generation)) this.receiving.set(false);
    }
  }

  private restorePendingReceipt(lease: PlatformSessionLease): PendingReceipt | null {
    const storageKey = receiptStorageKey(lease);
    const stored = this.retries.read(storageKey);
    if (!stored) return null;
    try {
      const value = JSON.parse(stored) as {
        idempotencyKey: string;
        request: PendingReceipt["request"];
      };
      if (!value?.idempotencyKey || !value.request) return null;
      const pending: PendingReceipt = { ...value, storageKey };
      this.pendingReceipt.set(pending);
      this.filters.set({
        ...EMPTY_FILTERS,
        warehouseId: pending.request.warehouseId,
        zoneId: pending.request.zoneId,
        catalogItemId: pending.request.catalogItemId,
      });
      this.receiptDraft.set({
        ...EMPTY_DRAFT,
        warehouseId: pending.request.warehouseId,
        zoneId: pending.request.zoneId,
        catalogItemId: pending.request.catalogItemId,
        skuId: pending.request.skuId,
        unit: pending.request.unit,
        batchNumber: pending.request.batchNumber,
        productionDate: pending.request.productionDate,
        receivedAtLocal: toLocalDateTimeInput(pending.request.receivedAt),
        expirationDate: pending.request.expirationDate,
        quantity: String(pending.request.quantity),
        temperatureReading: pending.request.temperatureReading === null
          ? ""
          : String(pending.request.temperatureReading),
        notes: pending.request.notes ?? "",
      });
      return pending;
    } catch {
      this.retries.remove(storageKey);
      return null;
    }
  }

  private canEditReceipt(): boolean {
    return this.canReceive() && this.canReadCatalog() && !this.receiptLocked() && !this.catalogLoading();
  }

  private canEditFilters(): boolean {
    return this.canRead() && !this.receiptLocked();
  }

  private isCurrent(lease: PlatformSessionLease, generation: number): boolean {
    return !this.destroyRef.destroyed &&
      generation === this.generation &&
      this.canRead() &&
      this.sessions.isSessionLeaseCurrent(lease);
  }

  private resetContextState(): void {
    this.filters.set(EMPTY_FILTERS);
    this.receiptDraft.set(EMPTY_DRAFT);
    this.warehouses.set([]);
    this.zones.set([]);
    this.lotsPage.set(null);
    this.catalogPage.set(null);
    this.selectedCatalogItem.set(null);
    this.brandOptions.set([]);
    this.categoryOptions.set([]);
    this.catalogQuery.set("");
    this.selectedBrand.set("");
    this.selectedCategory.set("");
    this.pendingReceipt.set(null);
    this.selectedEvidenceFile.set(null);
    this.selectedEvidenceChecksum.set("");
    this.pendingEvidenceUpload.set(null);
    this.evidenceStatus.set(null);
    this.availableEvidence.set(null);
    this.warehousesLoading.set(false);
    this.zonesLoading.set(false);
    this.lotsLoading.set(false);
    this.catalogLoading.set(false);
    this.filterOptionsLoading.set(false);
    this.receiving.set(false);
    this.evidenceFileHashing.set(false);
    this.evidenceLoading.set(false);
    this.evidenceError.set("");
    this.evidenceNotice.set("");
    this.warehouseError.set("");
    this.zonesError.set("");
    this.lotsError.set("");
    this.catalogError.set("");
    this.filterOptionsError.set("");
    this.receiptError.set("");
    this.receiptNotice.set("");
  }
}

async function readAllPages<U>(
  fetchPage: (page: number) => Promise<{
    readonly page: number;
    readonly size: number;
    readonly total: number;
    readonly items: readonly U[];
  }>,
): Promise<U[]> {
  const values: U[] = [];
  let expectedTotal: number | null = null;
  let page = 0;
  do {
    const result = await fetchPage(page);
    if (
      result.page !== page ||
      !Number.isSafeInteger(result.size) ||
      result.size < 1 ||
      result.size > REFERENCE_PAGE_SIZE ||
      !Number.isSafeInteger(result.total) ||
      result.total < result.items.length ||
      result.items.length > result.size
    ) {
      throw new Error("Reference page metadata is invalid.");
    }
    if (expectedTotal === null) expectedTotal = result.total;
    else if (expectedTotal !== result.total) throw new Error("Reference page changed during pagination.");
    values.push(...result.items);
    if (result.items.length === 0 && values.length < expectedTotal) throw new Error("Reference page ended before reported total.");
    page += 1;
  } while (values.length < (expectedTotal ?? 0));
  if (new Set(values.map((item) => (item as { id?: unknown }).id)).size !== values.length) {
    throw new Error("Reference pages contain duplicate identities.");
  }
  return values;
}

function validWarehousePage<T>(
  page: WarehouseInventoryPageResponse<T>,
  requestedPage: number,
  requestedSize: number,
): boolean {
  return page.page === requestedPage &&
    page.size === requestedSize &&
    Number.isSafeInteger(page.total) &&
    page.total >= page.items.length &&
    page.items.length <= page.size;
}

function validCatalogPage(page: BuyerCatalogPageResponse, requestedPage: number): boolean {
  return page.page === requestedPage &&
    Number.isSafeInteger(page.size) && page.size > 0 && page.size <= 100 &&
    Number.isSafeInteger(page.totalItems) && page.totalItems >= page.items.length &&
    Number.isSafeInteger(page.totalPages) && page.totalPages >= 0 &&
    page.items.length <= page.size;
}

function isWarehouse(value: WarehouseInventoryWarehouseResponse): boolean {
  return Boolean(value && value.id?.trim() && value.code?.trim() && value.name?.trim() && value.status?.trim());
}

function isZone(value: WarehouseInventoryZoneResponse): boolean {
  return Boolean(value && value.id?.trim() && value.warehouseId?.trim() && value.code?.trim() && value.name?.trim() && value.status?.trim());
}

function isLot(value: WarehouseInventoryLotResponse): boolean {
  return Boolean(
    value && value.id?.trim() && value.warehouseId?.trim() && value.zoneId?.trim() &&
    value.catalogItemId?.trim() && value.batchNumber?.trim() && value.unit?.trim() &&
    Number.isFinite(value.onHand) && Number.isFinite(value.reserved) &&
    Number.isFinite(value.available) && typeof value.status === "string" &&
    Number.isSafeInteger(value.version),
  );
}

function isNamedOption(value: unknown): value is { readonly id: string; readonly name: string } {
  return typeof value === "object" && value !== null &&
    typeof (value as { id?: unknown }).id === "string" && Boolean((value as { id: string }).id.trim()) &&
    typeof (value as { name?: unknown }).name === "string" && Boolean((value as { name: string }).name.trim());
}

function matchesReceipt(lot: WarehouseInventoryLotResponse, request: ReceiveWarehouseStockRequest): boolean {
  return isLot(lot) &&
    lot.warehouseId === request.warehouseId &&
    lot.zoneId === request.zoneId &&
    lot.catalogItemId === request.catalogItemId &&
    lot.batchNumber === request.batchNumber &&
    lot.expirationDate === request.expirationDate &&
    lot.productionDate === (request.productionDate ?? null) &&
    (!request.receivedAt || Date.parse(lot.receivedAt) === Date.parse(request.receivedAt)) &&
    lot.unit === request.unit &&
    (!request.skuId || lot.skuId === request.skuId);
}

function receiptStorageKey(lease: PlatformSessionLease): string {
  return `${RECEIPT_RETRY_PREFIX}${[
    lease.scope.userId,
    lease.scope.tenantId,
    lease.scope.workspaceId,
    lease.scope.membershipId,
  ].map(encodeURIComponent).join(":")}`;
}

function evidenceStorageKey(lease: PlatformSessionLease): string {
  return `${EVIDENCE_RETRY_PREFIX}${[
    lease.scope.userId,
    lease.scope.tenantId,
    lease.scope.workspaceId,
    lease.scope.membershipId,
  ].map(encodeURIComponent).join(":")}`;
}

async function hashEvidenceFile(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable.");
  const bytes = typeof file.arrayBuffer === "function"
    ? await file.arrayBuffer()
    : await readFileAsArrayBuffer(file);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Photo bytes could not be read."));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Photo bytes were not returned as an array buffer."));
    };
    reader.readAsArrayBuffer(file);
  });
}

function matchesEvidenceFile(
  pending: PendingEvidenceUpload,
  file: File,
  checksumSha256: string,
): boolean {
  return file.name === pending.originalFilename &&
    file.type.trim() === pending.declaredContentType &&
    file.size === pending.byteSize &&
    checksumSha256.toLowerCase() === pending.checksumSha256;
}

function matchesEvidenceIdentity(
  value: BusinessDocumentEvidenceResponse,
  pending: PendingEvidenceUpload,
  expectedId: string | null,
): boolean {
  return isBusinessDocumentEvidence(value) &&
    value.subjectType === "WAREHOUSE" &&
    value.subjectId === pending.warehouseId &&
    (expectedId === null || value.id === expectedId) &&
    value.declaredContentType === pending.declaredContentType &&
    value.byteSize === pending.byteSize &&
    (value.checksumSha256 === null || value.checksumSha256.toLowerCase() === pending.checksumSha256);
}

function normalizeBusinessDocumentEvidence(value: unknown): BusinessDocumentEvidenceResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const evidence = value as Record<string, unknown>;
  const normalized = {
    ...evidence,
    requestedByMembershipId: evidence["requestedByMembershipId"] === undefined
      ? null
      : evidence["requestedByMembershipId"],
  };
  return isBusinessDocumentEvidence(normalized) ? normalized : null;
}

function isBusinessDocumentEvidence(value: unknown): value is BusinessDocumentEvidenceResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Partial<BusinessDocumentEvidenceResponse>;
  return isUuid(evidence.id) &&
    typeof evidence.subjectType === "string" &&
    isUuid(evidence.subjectId) &&
    typeof evidence.lifecycleStatus === "string" &&
    isBoundedText(evidence.declaredContentType, 160) &&
    (evidence.detectedContentType === null || typeof evidence.detectedContentType === "string") &&
    isBoundedText(evidence.originalFilename, 255) &&
    (evidence.checksumSha256 === null || typeof evidence.checksumSha256 === "string") &&
    Number.isSafeInteger(evidence.byteSize) &&
    typeof evidence.createdAt === "string" &&
    (evidence.scannedAt === null || typeof evidence.scannedAt === "string") &&
    (evidence.failureCode === null || typeof evidence.failureCode === "string") &&
    typeof evidence.updatedAt === "string" &&
    (evidence.requestedByMembershipId === null || typeof evidence.requestedByMembershipId === "string");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function parseLocalDateTime(value: string): string | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function toLocalDateTimeInput(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "";
  const local = new Date(parsed.valueOf() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function catalogDetailError(error: unknown): string {
  if (error instanceof NexaApiError && error.kind === "forbidden") return "Catalog access is not available to this membership.";
  return "The selected catalog item could not be confirmed. Search again before receiving stock.";
}

function receiptErrorMessage(error: unknown, code?: string): string {
  if (code === "BUSINESS_EVIDENCE_NOT_AVAILABLE") {
    return "The API blocked this temperature reading. Attach a photo for this warehouse, wait until its scan is available, then record the receipt.";
  }
  if (code === "TEMPERATURE_REQUIRED") return "The selected cold-chain item requires a receiving temperature.";
  if (code === "WRONG_UNIT") return "The API rejected the unit. Reload the catalog item and use its current SKU unit.";
  if (code === "WAREHOUSE_NOT_FOUND" || code === "STORAGE_ZONE_NOT_FOUND") return "The warehouse or zone is no longer available through the current grants. Refresh and confirm scope.";
  if (code === "CATALOG_ITEM_NOT_FOUND") return "The catalog item is no longer active. Search and select an active item again.";
  if (code === "IDEMPOTENCY_PAYLOAD_CONFLICT") return "The saved retry key conflicts with another payload. Receipt remains locked; contact support before creating another receipt.";
  if (error instanceof NexaApiError && error.kind === "forbidden") return "The API denied receipt. Verify inventory.receive permission and the warehouse grant; saved request remains locked.";
  if (error instanceof NexaApiError && error.kind === "unauthenticated") return "Session expired before receipt confirmation. Sign in again, then retry the saved request.";
  if (error instanceof NexaApiError && (error.kind === "network" || error.kind === "timeout" || error.kind === "server" || error.kind === "rate-limited")) {
    return "Receipt outcome is unknown. Retry the exact saved request; form edits stay disabled until API confirms it.";
  }
  if (error instanceof NexaApiError && error.kind === "validation") return "The API rejected the receipt. Correct the fields and submit again.";
  return "Receipt was not confirmed. Saved payload remains locked; retry the exact request before starting another receipt.";
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof NexaApiError && error.kind === "forbidden") {
    return "This membership or warehouse grant cannot read the requested data.";
  }
  if (error instanceof NexaApiError && error.kind === "unauthenticated") {
    return "Session expired. Sign in again to load this warehouse data.";
  }
  return fallback;
}
