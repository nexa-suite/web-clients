import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { ActivatedRoute, Router, provideRouter } from "@angular/router";
import type { BuyerAddressResponse, PurchaseRequestDraft } from "@nexa/api";
import { PortalBuyerEligibilityService } from "../../customer-buyer-relationships/application/public-api";
import { CatalogStore, type BuyerCatalogItem, type CatalogDetailState, type CatalogPageState, type CatalogSearch } from "../../catalog-commercial-policy/application/public-api";
import { PortalSessionStore, type PortalSessionLease } from "../../tenant-access-governance/application/public-api";
import { BuyerDeliveryLeadPolicyState, BuyerDraftWorkflowState, BuyerPurchaseRequestDraftStore } from "../application/public-api";
import { BuyerRequestSelectionStore } from "../application/buyer-request-selection.store";
import { BuyerPurchaseRequestDraftPageComponent } from "./buyer-purchase-request-draft-page.component";
import { BUYER_WALLET_CAPABILITIES_PORT } from "../../payments/application/public-api";

describe("BuyerPurchaseRequestDraftPageComponent", () => {
  const lease: PortalSessionLease = {
    epoch: 1,
    scope: {
      userId: "buyer-user",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "buyer-membership-1",
      surface: "PORTAL",
    },
  };
  const address: BuyerAddressResponse = {
    id: "address-private-id",
    clientAccountId: "account-1",
    label: "Receiving location",
    addressType: "DELIVERY",
    line: "Private warehouse address",
    reference: "Gate 4",
    countryCode: "PE",
    departmentCode: null,
    provinceCode: null,
    districtCode: null,
    recipientName: "Buyer recipient",
    recipientPhone: "5550100",
    roadType: null,
    streetName: null,
    streetNumber: null,
    interior: null,
    postalCode: null,
    receivingInstructions: null,
    receivingHours: null,
    latitude: null,
    longitude: null,
    placeId: null,
    source: null,
    defaultAddress: true,
    active: true,
    version: 1,
  };
  const draft: PurchaseRequestDraft = {
    id: "draft-private-id",
    clientAccountId: "account-1",
    buyerMembershipId: "buyer-membership-1",
    status: "DRAFT",
    version: 4,
    requestedDeliveryDate: "2026-11-05",
    paymentPreference: "CREDIT_LINE",
    creditResult: null,
    routeProvider: null,
    lines: [{
      id: "line-1",
      skuId: "sellable-sku-1",
      skuCode: "SKU-001",
      presentation: "Private catalog item",
      quantity: 7,
      unit: "case",
      baseUnitPrice: "10.00",
      effectiveUnitPrice: "10.00",
      discountAmount: "0.00",
      currency: "USD",
      notes: "Private draft line notes",
    }],
    destination: { addressId: address.id, snapshot: "{}", schemaVersion: "v1" },
    route: null,
    warehouseSelection: null,
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
    submittedAt: null,
  };
  const catalogItem = {
    catalogItemId: "catalog-item-1",
    sellableSkuId: "sellable-sku-1",
    skuCode: "SKU-001",
    itemName: "Private catalog item",
  } as BuyerCatalogItem;
  const secondCatalogItem = {
    ...catalogItem,
    catalogItemId: "catalog-item-2",
    sellableSkuId: "sellable-sku-2",
    skuCode: "SKU-002",
    itemName: "Another catalog item",
  } as BuyerCatalogItem;

  it("blocks draft creation when delivery policy is unavailable or date is before API minimum", async () => {
    const deliveryPolicy = deliveryPolicyMock();
    deliveryPolicy.deliveryLeadPolicy.set({
      status: "error",
      policy: null,
      errorMessage: "Delivery date rules could not be loaded.",
    });
    const store = {
      state: signal<BuyerDraftWorkflowState>(emptyWorkflow()),
      ...deliveryPolicy,
      clear: vi.fn(),
      loadAddresses: vi.fn(async () => undefined),
      createDraft: vi.fn(async () => draft),
    };
    configureDraftPageTest(store, null, lease, catalogItem);
    const fixture = TestBed.createComponent(BuyerPurchaseRequestDraftPageComponent);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Delivery date rules could not be loaded.");
    const dateInput = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.disabled).toBe(true);
    const page = fixture.componentInstance as unknown as {
      beginDraft(): Promise<void>;
      requestedDeliveryDate: string;
    };
    await page.beginDraft();
    expect(store.createDraft).not.toHaveBeenCalled();

    deliveryPolicy.deliveryLeadPolicy.set({
      status: "ready",
      policy: {
        minimumDeliveryLeadBusinessDays: 5,
        minimumAllowedDeliveryDate: "2026-11-01",
        timezone: "America/Lima",
      },
      errorMessage: null,
    });
    page.requestedDeliveryDate = "2026-10-31";
    await page.beginDraft();
    expect(store.createDraft).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it("preserves catalog selection when leaving an existing draft route before draft loading finishes", async () => {
    const draftLoading = deferred<void>();
    const store = {
      state: signal<BuyerDraftWorkflowState>(emptyWorkflow()),
      ...deliveryPolicyMock(),
      clear: vi.fn(),
      loadAddresses: vi.fn(async () => undefined),
      loadDraft: vi.fn(() => draftLoading.promise),
    };
    configureDraftPageTest(store, draft.id, lease, catalogItem);
    const requestSelection = TestBed.inject(BuyerRequestSelectionStore);
    requestSelection.add(catalogItem);
    const fixture = TestBed.createComponent(BuyerPurchaseRequestDraftPageComponent);
    const loading = fixture.componentInstance.ngOnInit();
    for (let turn = 0; turn < 8 && !store.loadDraft.mock.calls.length; turn += 1) {
      await Promise.resolve();
    }

    expect(store.loadDraft).toHaveBeenCalledWith(draft.id);
    fixture.destroy();

    expect(requestSelection.lines().map((line) => line.skuId)).toEqual([catalogItem.sellableSkuId]);
    draftLoading.resolve();
    await loading;
  });

  it("keeps updated and newly selected products when initial draft line save finishes", async () => {
    const lineSave = deferred<boolean>();
    const state = signal<BuyerDraftWorkflowState>(emptyWorkflow());
    const store = {
      state,
      ...deliveryPolicyMock(),
      clear: vi.fn(() => state.set(emptyWorkflow())),
      loadAddresses: vi.fn(async () => undefined),
      createDraft: vi.fn(async () => {
        state.set({ ...emptyWorkflow(), status: "ready", draft });
        return draft;
      }),
      replaceLines: vi.fn(() => lineSave.promise),
    };
    configureDraftPageTest(store, null, lease, catalogItem);
    const requestSelection = TestBed.inject(BuyerRequestSelectionStore);
    requestSelection.add(catalogItem);
    const fixture = TestBed.createComponent(BuyerPurchaseRequestDraftPageComponent);
    await fixture.componentInstance.ngOnInit();
    const page = fixture.componentInstance as unknown as { beginDraft(): Promise<void> };
    const saving = page.beginDraft();
    for (let turn = 0; turn < 8 && !store.replaceLines.mock.calls.length; turn += 1) {
      await Promise.resolve();
    }

    expect(store.replaceLines).toHaveBeenCalledOnce();
    requestSelection.add(secondCatalogItem);
    requestSelection.setQuantity(catalogItem.sellableSkuId ?? "", 3);
    lineSave.resolve(true);
    await saving;

    expect(requestSelection.lines().map((line) => [line.skuId, line.quantity])).toEqual([
      [catalogItem.sellableSkuId, 3],
      [secondCatalogItem.sellableSkuId, 1],
    ]);
    fixture.destroy();
  });

  it("keeps newly selected products when retrying draft line save", async () => {
    const firstLineSave = deferred<boolean>();
    const secondLineSave = deferred<boolean>();
    const state = signal<BuyerDraftWorkflowState>(emptyWorkflow());
    let lineSaveCount = 0;
    const store = {
      state,
      ...deliveryPolicyMock(),
      clear: vi.fn(() => state.set(emptyWorkflow())),
      loadAddresses: vi.fn(async () => undefined),
      createDraft: vi.fn(async () => {
        state.set({ ...emptyWorkflow(), status: "ready", draft });
        return draft;
      }),
      replaceLines: vi.fn(() => ++lineSaveCount === 1 ? firstLineSave.promise : secondLineSave.promise),
    };
    configureDraftPageTest(store, null, lease, catalogItem);
    const requestSelection = TestBed.inject(BuyerRequestSelectionStore);
    requestSelection.add(catalogItem);
    const fixture = TestBed.createComponent(BuyerPurchaseRequestDraftPageComponent);
    await fixture.componentInstance.ngOnInit();
    const page = fixture.componentInstance as unknown as {
      beginDraft(): Promise<void>;
      saveLines(): Promise<void>;
    };

    const initialSave = page.beginDraft();
    for (let turn = 0; turn < 8 && lineSaveCount < 1; turn += 1) await Promise.resolve();
    firstLineSave.resolve(false);
    await initialSave;

    const retry = page.saveLines();
    for (let turn = 0; turn < 8 && lineSaveCount < 2; turn += 1) await Promise.resolve();
    expect(lineSaveCount).toBe(2);
    requestSelection.add(secondCatalogItem);
    secondLineSave.resolve(true);
    await retry;

    expect(requestSelection.lines().map((line) => line.skuId)).toEqual([secondCatalogItem.sellableSkuId]);
    fixture.destroy();
  });

  it("prefills the requested SKU before catalog loading and preserves quantity edits", async () => {
    const state = signal<BuyerDraftWorkflowState>(emptyWorkflow());
    let finishAddressLoading!: () => void;
    const addressLoading = new Promise<void>((resolve) => { finishAddressLoading = resolve; });
    let finishCatalogLoading!: () => void;
    const catalogLoading = new Promise<void>((resolve) => { finishCatalogLoading = resolve; });
    const store = {
      state,
      ...deliveryPolicyMock(),
      clear: vi.fn(() => state.set(emptyWorkflow())),
      loadAddresses: vi.fn(() => addressLoading),
    };
    const catalog = createCatalogStoreMock({ kind: "results", page: { items: [catalogItem], page: 0, size: 50, totalItems: 1, totalPages: 1 }, errorMessage: null });
    catalog.load.mockImplementation(() => catalogLoading.then(() => undefined));
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestDraftPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => key === "skuId" ? catalogItem.sellableSkuId : null } } } },
        {
          provide: PortalSessionStore,
          useValue: {
            state: signal({ status: "authenticated", session: scopedBuyerSession(["buyer.sales.write", "catalog.read"]) }),
            captureSessionLease: vi.fn(() => lease),
            isSessionLeaseCurrent: vi.fn(() => true),
          },
        },
        { provide: PortalBuyerEligibilityService, useValue: { currentAccount: () => ({ id: "account-1" }) } },
        { provide: BuyerPurchaseRequestDraftStore, useValue: store },
        { provide: CatalogStore, useValue: catalog },
        { provide: BUYER_WALLET_CAPABILITIES_PORT, useValue: { canRead: () => false, orderPaymentSupported: () => false, loadCapabilities: vi.fn(), clear: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(BuyerPurchaseRequestDraftPageComponent);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector(".request-builder__line select") as HTMLSelectElement;
    expect(store.loadAddresses).not.toHaveBeenCalled();
    expect((fixture.componentInstance as unknown as { lines: readonly { skuId: string }[] }).lines[0]?.skuId).toBe(catalogItem.sellableSkuId);
    expect(select.value).toBe(catalogItem.sellableSkuId);
    expect(select.selectedOptions[0]?.textContent).toContain("SKU-001");

    const quantity = fixture.nativeElement.querySelector('.request-builder__line input[type="number"]') as HTMLInputElement;
    quantity.value = "2";
    quantity.dispatchEvent(new Event("input"));
    finishCatalogLoading();
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    expect(store.loadAddresses).toHaveBeenCalledWith("account-1");

    finishAddressLoading();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(select.value).toBe(catalogItem.sellableSkuId);
    expect(select.selectedOptions[0]?.textContent).toContain("SKU-001");
    expect((fixture.componentInstance as unknown as { lines: readonly { quantity: string }[] }).lines[0]?.quantity).toBe("2");
  });

  it("loads filtered catalog pages for SKU selection and retains a selected SKU across pages", async () => {
    const pageState = signal<CatalogPageState>({
      kind: "results",
      page: { items: [catalogItem], page: 0, size: 12, totalItems: 25, totalPages: 3 },
      errorMessage: null,
    });
    const searchState = signal<CatalogSearch>({ q: "", brand: "", category: "", coldChain: "", page: 0 });
    const catalog = {
      page: pageState,
      detail: signal<CatalogDetailState>({ kind: "idle", item: null, errorMessage: null }),
      search: searchState,
      brands: signal([{ id: "brand-1", name: "Northwind" }]),
      categories: signal([{ id: "category-1", name: "Grocery" }]),
      filterOptionsLoading: signal(false),
      filterOptionsError: signal(null),
      loadFilterOptions: vi.fn(async () => undefined),
      load: vi.fn(async () => undefined),
      applySearch: vi.fn(async (filters: { q: string; brand: string; category: string; coldChain: "" | "NONE" | "REFRIGERATED" | "FROZEN" }) => {
        searchState.set({ ...filters, page: 0 });
      }),
      changePage: vi.fn(async (page: number) => {
        searchState.update((current) => ({ ...current, page }));
      }),
    };
    const state = signal<BuyerDraftWorkflowState>(emptyWorkflow());
    const store = {
      state,
      ...deliveryPolicyMock(),
      clear: vi.fn(() => state.set(emptyWorkflow())),
      loadAddresses: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestDraftPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        {
          provide: PortalSessionStore,
          useValue: {
            state: signal({ status: "authenticated", session: scopedBuyerSession(["buyer.sales.write", "catalog.read"]) }),
            captureSessionLease: vi.fn(() => lease),
            isSessionLeaseCurrent: vi.fn(() => true),
          },
        },
        { provide: PortalBuyerEligibilityService, useValue: { currentAccount: () => ({ id: "account-1" }) } },
        { provide: BuyerPurchaseRequestDraftStore, useValue: store },
        { provide: CatalogStore, useValue: catalog },
        { provide: BUYER_WALLET_CAPABILITIES_PORT, useValue: { canRead: () => false, orderPaymentSupported: () => false, loadCapabilities: vi.fn(), clear: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(BuyerPurchaseRequestDraftPageComponent);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      catalogProductSearch: string;
      catalogBrandSearch: string;
      catalogCategorySearch: string;
      searchCatalog: () => Promise<void>;
      changeCatalogPage: (offset: number) => Promise<void>;
      updateLine: (index: number, field: "skuId", value: string) => void;
      skuLabel: (skuId: string) => string;
      hasPreviouslySelectedCatalogSku: (skuId: string) => boolean;
    };

    expect(catalog.load).toHaveBeenCalledOnce();
    expect(catalog.loadFilterOptions).toHaveBeenCalledOnce();
    const brandFilter = fixture.nativeElement.querySelector('select[name="catalogBrand"]') as HTMLSelectElement;
    const categoryFilter = fixture.nativeElement.querySelector('select[name="catalogCategory"]') as HTMLSelectElement;
    expect(fixture.nativeElement.querySelector('input[name="catalogBrand"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="catalogCategory"]')).toBeNull();
    expect([...brandFilter.options].some((option) => option.value === "Northwind")).toBe(true);
    expect([...categoryFilter.options].some((option) => option.value === "Grocery")).toBe(true);
    page.catalogProductSearch = "  oats ";
    fixture.debugElement.query(By.css('select[name="catalogBrand"]'))
      .triggerEventHandler("ngModelChange", "Northwind");
    fixture.debugElement.query(By.css('select[name="catalogCategory"]'))
      .triggerEventHandler("ngModelChange", "Grocery");
    fixture.detectChanges();
    expect(page.catalogBrandSearch).toBe("Northwind");
    expect(page.catalogCategorySearch).toBe("Grocery");
    await page.searchCatalog();
    expect(catalog.applySearch).toHaveBeenCalledWith({ q: "oats", brand: "Northwind", category: "Grocery", coldChain: "" });

    page.updateLine(0, "skuId", catalogItem.sellableSkuId ?? "");
    pageState.set({
      kind: "results",
      page: { items: [], page: 1, size: 12, totalItems: 25, totalPages: 3 },
      errorMessage: null,
    });
    expect(page.hasPreviouslySelectedCatalogSku(catalogItem.sellableSkuId ?? "")).toBe(true);
    expect(page.skuLabel(catalogItem.sellableSkuId ?? "")).toContain("Private catalog item");

    pageState.set({
      kind: "results",
      page: { items: [catalogItem], page: 0, size: 12, totalItems: 25, totalPages: 3 },
      errorMessage: null,
    });
    await page.changeCatalogPage(1);
    expect(catalog.changePage).toHaveBeenCalledWith(1);
  });

  it("clears and hides a loaded draft form when its Buyer session lease expires", async () => {
    const currentLease = signal<PortalSessionLease | null>(lease);
    const sessions = {
      state: signal({
        status: "authenticated",
        session: {
          ...scopedBuyerSession(["payment.read", "buyer.sales.write"]),
        },
      }),
      captureSessionLease: vi.fn(() => currentLease()),
      isSessionLeaseCurrent: vi.fn((candidate: PortalSessionLease) => currentLease()?.epoch === candidate.epoch),
    };
    const state = signal<BuyerDraftWorkflowState>(emptyWorkflow());
    const store = {
      state,
      ...deliveryPolicyMock(),
      clear: vi.fn(() => state.set(emptyWorkflow())),
      loadAddresses: vi.fn(async () => state.update((current) => ({ ...current, addresses: [address] }))),
      loadDraft: vi.fn(async () => state.set({
        ...emptyWorkflow(),
        status: "ready",
        draft,
        addresses: [address],
      })),
    };
    const catalog = createCatalogStoreMock({
        kind: "results",
        page: { items: [catalogItem], page: 0, size: 50, totalItems: 1, totalPages: 1 },
        errorMessage: null,
      });
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestDraftPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => key === "draftId" ? draft.id : null } } } },
        { provide: PortalSessionStore, useValue: sessions },
        { provide: PortalBuyerEligibilityService, useValue: { currentAccount: () => ({ id: "account-1" }) } },
        { provide: BuyerPurchaseRequestDraftStore, useValue: store },
        { provide: CatalogStore, useValue: catalog },
        { provide: BUYER_WALLET_CAPABILITIES_PORT, useValue: { canRead: () => false, orderPaymentSupported: () => false, loadCapabilities: vi.fn(), clear: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(BuyerPurchaseRequestDraftPageComponent);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    const form = fixture.componentInstance as unknown as {
      requestedDeliveryDate: string;
      paymentPreference: string;
      lines: readonly { notes: string }[];
      selectedAddressId: string;
    };

    expect(store.loadDraft).toHaveBeenCalledWith(draft.id);
    expect(store.state().draft?.lines[0]?.notes).toBe("Private draft line notes");
    expect(form.lines[0]?.notes).toBe("Private draft line notes");
    expect(fixture.nativeElement.textContent).toContain("Private warehouse address");
    expect(form.requestedDeliveryDate).toBe("2026-11-05");
    expect(form.paymentPreference).toBe("CREDIT_LINE");
    expect(form.selectedAddressId).toBe(address.id);

    currentLease.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("Private warehouse address");
    expect(fixture.nativeElement.textContent).toContain("Your Buyer context changed");
    expect(fixture.nativeElement.querySelectorAll("input")).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll("select")).toHaveLength(0);
    expect(form.lines).toEqual([{ skuId: "", quantity: "1", unit: "", notes: "" }]);
    expect(form.paymentPreference).toBe("");
    expect(form.selectedAddressId).toBe("");
    expect(store.clear).toHaveBeenCalledTimes(2);
  });

  it("explains when the selected saved address has no coordinates and disables route preview", async () => {
    const state = signal<BuyerDraftWorkflowState>({
      ...emptyWorkflow(),
      status: "ready",
      draft,
      addresses: [address],
    });
    const store = {
      state,
      ...deliveryPolicyMock(),
      clear: vi.fn(),
      loadAddresses: vi.fn(async () => undefined),
      loadDraft: vi.fn(async () => undefined),
      previewRoute: vi.fn(async () => undefined),
    };
    const catalog = createCatalogStoreMock({ kind: "results", page: { items: [catalogItem], page: 0, size: 50, totalItems: 1, totalPages: 1 }, errorMessage: null });
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestDraftPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => key === "draftId" ? draft.id : null } } } },
        {
          provide: PortalSessionStore,
          useValue: {
            state: signal({ status: "authenticated", session: scopedBuyerSession(["buyer.sales.write"]) }),
            captureSessionLease: vi.fn(() => lease),
            isSessionLeaseCurrent: vi.fn(() => true),
          },
        },
        { provide: PortalBuyerEligibilityService, useValue: { currentAccount: () => ({ id: "account-1" }) } },
        { provide: BuyerPurchaseRequestDraftStore, useValue: store },
        { provide: CatalogStore, useValue: catalog },
        { provide: BUYER_WALLET_CAPABILITIES_PORT, useValue: { canRead: () => false, orderPaymentSupported: () => false, loadCapabilities: vi.fn(), clear: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(BuyerPurchaseRequestDraftPageComponent);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("This saved address has no map coordinates, so route preview is unavailable.");
    expect(fixture.nativeElement.textContent).toContain("Ask Sales to add or update a delivery address with coordinates");
    const previewButton = [...fixture.nativeElement.querySelectorAll("nexa-button button")]
      .find((button: HTMLButtonElement) => button.textContent?.includes("Preview route")) as HTMLButtonElement;
    expect(previewButton.disabled).toBe(true);
    expect(store.previewRoute).not.toHaveBeenCalled();
  });

  it("offers WALLET only with the API capability and Buyer read/write grants, then clears stale selection", async () => {
    const currentSession = signal({
      status: "authenticated",
      session: scopedBuyerSession(["payment.read", "buyer.sales.write"]),
    });
    const walletSupported = signal(false);
    const currentAccount = signal({ id: "account-1" });
    const walletCapabilities = {
      canRead: vi.fn(() => true),
      orderPaymentSupported: vi.fn(() => walletSupported()),
      loadCapabilities: vi.fn(async () => undefined),
      clear: vi.fn(),
    };
    const workflow = signal<BuyerDraftWorkflowState>({
      ...emptyWorkflow(),
      status: "ready",
      draft,
    });
    const store = {
      state: workflow,
      ...deliveryPolicyMock(),
      clear: vi.fn(),
      loadAddresses: vi.fn(async () => undefined),
      loadDraft: vi.fn(async () => undefined),
      setPreferences: vi.fn(async () => undefined),
    };
    const catalog = createCatalogStoreMock({ kind: "results", page: { items: [catalogItem], page: 0, size: 50, totalItems: 1, totalPages: 1 }, errorMessage: null });
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestDraftPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => key === "draftId" ? draft.id : null } } } },
        { provide: PortalSessionStore, useValue: { state: currentSession, captureSessionLease: vi.fn(() => lease), isSessionLeaseCurrent: vi.fn(() => true) } },
        { provide: PortalBuyerEligibilityService, useValue: { currentAccount: () => currentAccount() } },
        { provide: BuyerPurchaseRequestDraftStore, useValue: store },
        { provide: CatalogStore, useValue: catalog },
        { provide: BUYER_WALLET_CAPABILITIES_PORT, useValue: walletCapabilities },
      ],
    });
    const fixture = TestBed.createComponent(BuyerPurchaseRequestDraftPageComponent);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      paymentPreferences: () => readonly string[];
      choosePaymentPreference(value: string): void;
      savePreferences(): Promise<void>;
      paymentPreference: string;
    };

    expect(walletCapabilities.loadCapabilities).toHaveBeenCalledOnce();
    expect(page.paymentPreferences()).not.toContain("WALLET");
    page.choosePaymentPreference("WALLET");
    await page.savePreferences();
    expect(store.setPreferences).not.toHaveBeenCalled();

    walletSupported.set(true);
    fixture.detectChanges();
    expect(page.paymentPreferences()).toContain("WALLET");
    const preferenceSelect = [...fixture.nativeElement.querySelectorAll("label")]
      .find((label: HTMLLabelElement) => label.textContent?.includes("Payment preference"))
      ?.querySelector("select") as HTMLSelectElement;
    preferenceSelect.value = "WALLET";
    preferenceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    fixture.detectChanges();
    expect(page.paymentPreference).toBe("WALLET");
    expect(fixture.nativeElement.textContent).toContain("no wallet funds are reserved or debited");
    await page.savePreferences();
    expect(store.setPreferences).toHaveBeenCalledWith({
      paymentPreference: "WALLET",
      requestedDeliveryDate: draft.requestedDeliveryDate,
    });

    store.setPreferences.mockClear();
    walletCapabilities.loadCapabilities.mockImplementationOnce(async () => {
      walletSupported.set(false);
    });
    await page.savePreferences();
    fixture.detectChanges();
    expect(walletCapabilities.loadCapabilities).toHaveBeenCalledTimes(3);
    expect(store.setPreferences).not.toHaveBeenCalled();
    expect(page.paymentPreference).toBe("");

    currentSession.set({
      status: "authenticated",
      session: scopedBuyerSession(["payment.read"]),
    });
    fixture.detectChanges();
    expect(page.paymentPreferences()).not.toContain("WALLET");
    expect(page.paymentPreference).toBe("");
  });
});

function emptyWorkflow(): BuyerDraftWorkflowState {
  return {
    status: "idle",
    draft: null,
    review: null,
    addresses: [],
    submissionKeyPending: false,
    errorMessage: null,
  };
}

function deliveryPolicyMock() {
  const deliveryLeadPolicy = signal<BuyerDeliveryLeadPolicyState>({
    status: "ready",
    policy: {
      minimumDeliveryLeadBusinessDays: 5,
      minimumAllowedDeliveryDate: "2026-11-01",
      timezone: "America/Lima",
    },
    errorMessage: null,
  });
  return {
    deliveryLeadPolicy,
    loadDeliveryLeadPolicy: vi.fn(async () => undefined),
    allowsDeliveryDate: vi.fn((value: string) => {
      const state = deliveryLeadPolicy();
      return state.status === "ready" &&
        Boolean(state.policy && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= state.policy.minimumAllowedDeliveryDate);
    }),
  };
}

function configureDraftPageTest(
  store: unknown,
  draftId: string | null,
  lease: PortalSessionLease,
  catalogItem: BuyerCatalogItem,
): void {
  TestBed.configureTestingModule({
    imports: [BuyerPurchaseRequestDraftPageComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (key: string) => key === "draftId" ? draftId : null,
            },
          },
        },
      },
      {
        provide: PortalSessionStore,
        useValue: {
          state: signal({ status: "authenticated", session: scopedBuyerSession(["buyer.sales.write"]) }),
          captureSessionLease: vi.fn(() => lease),
          isSessionLeaseCurrent: vi.fn(() => true),
        },
      },
      { provide: PortalBuyerEligibilityService, useValue: { currentAccount: () => ({ id: "account-1" }) } },
      { provide: BuyerPurchaseRequestDraftStore, useValue: store },
      {
        provide: CatalogStore,
        useValue: createCatalogStoreMock({
          kind: "results",
          page: { items: [catalogItem], page: 0, size: 50, totalItems: 1, totalPages: 1 },
          errorMessage: null,
        }),
      },
      {
        provide: BUYER_WALLET_CAPABILITIES_PORT,
        useValue: { canRead: () => false, orderPaymentSupported: () => false, loadCapabilities: vi.fn(), clear: vi.fn() },
      },
    ],
  });
  vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function createCatalogStoreMock(pageState: CatalogPageState) {
  const search = signal<CatalogSearch>({ q: "", brand: "", category: "", coldChain: "", page: 0 });
  return {
    page: signal(pageState),
    detail: signal<CatalogDetailState>({ kind: "idle", item: null, errorMessage: null }),
    search,
    brands: signal([{ id: "brand-1", name: "Northwind" }]),
    categories: signal([{ id: "category-1", name: "Grocery" }]),
    filterOptionsLoading: signal(false),
    filterOptionsError: signal(null),
    loadFilterOptions: vi.fn(async () => undefined),
    load: vi.fn(async () => undefined),
    applySearch: vi.fn(async (filters: Omit<CatalogSearch, "page">) => {
      search.set({ ...filters, page: 0 });
    }),
    changePage: vi.fn(async (page: number) => {
      search.update((current) => ({ ...current, page }));
    }),
  };
}

function scopedBuyerSession(permissions: readonly string[]) {
  return {
    surface: "PORTAL",
    user: { userId: "buyer-user" },
    tenant: { tenantId: "tenant-1" },
    workspace: { workspaceId: "workspace-1" },
    membership: { membershipId: "buyer-membership-1", roles: ["BUYER"], permissions },
  };
}
