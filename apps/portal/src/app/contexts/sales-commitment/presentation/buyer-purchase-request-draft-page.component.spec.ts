import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, provideRouter } from "@angular/router";
import type { BuyerAddressResponse, PurchaseRequestDraft } from "@nexa/api";
import { PortalBuyerEligibilityService } from "../../customer-buyer-relationships/application/public-api";
import { CatalogStore, type BuyerCatalogItem, type CatalogDetailState, type CatalogPageState } from "../../catalog-commercial-policy/application/public-api";
import { PortalSessionStore, type PortalSessionLease } from "../../tenant-access-governance/application/public-api";
import { BuyerDraftWorkflowState, BuyerPurchaseRequestDraftStore } from "../application/public-api";
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

  it("clears and hides a loaded draft form when its Buyer session lease expires", async () => {
    const currentLease = signal<PortalSessionLease | null>(lease);
    const sessions = {
      state: signal({
        status: "authenticated",
        session: {
          surface: "PORTAL",
          membership: { roles: ["BUYER"], permissions: ["payment.read", "buyer.sales.write"] },
        },
      }),
      captureSessionLease: vi.fn(() => currentLease()),
      isSessionLeaseCurrent: vi.fn((candidate: PortalSessionLease) => currentLease()?.epoch === candidate.epoch),
    };
    const state = signal<BuyerDraftWorkflowState>(emptyWorkflow());
    const store = {
      state,
      clear: vi.fn(() => state.set(emptyWorkflow())),
      loadAddresses: vi.fn(async () => state.update((current) => ({ ...current, addresses: [address] }))),
      loadDraft: vi.fn(async () => state.set({
        ...emptyWorkflow(),
        status: "ready",
        draft,
        addresses: [address],
      })),
    };
    const catalog = {
      page: signal<CatalogPageState>({
        kind: "results",
        page: { items: [catalogItem], page: 0, size: 50, totalItems: 1, totalPages: 1 },
        errorMessage: null,
      }),
      detail: signal<CatalogDetailState>({ kind: "idle", item: null, errorMessage: null }),
    };
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

  it("offers WALLET only with the API capability and Buyer read/write grants, then clears stale selection", async () => {
    const currentSession = signal({
      status: "authenticated",
      session: {
        surface: "PORTAL",
        membership: { roles: ["BUYER"], permissions: ["payment.read", "buyer.sales.write"] },
      },
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
      clear: vi.fn(),
      loadAddresses: vi.fn(async () => undefined),
      loadDraft: vi.fn(async () => undefined),
      setPreferences: vi.fn(async () => undefined),
    };
    const catalog = {
      page: signal<CatalogPageState>({ kind: "results", page: { items: [catalogItem], page: 0, size: 50, totalItems: 1, totalPages: 1 }, errorMessage: null }),
      detail: signal<CatalogDetailState>({ kind: "idle", item: null, errorMessage: null }),
    };
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
      session: { surface: "PORTAL", membership: { roles: ["BUYER"], permissions: ["payment.read"] } },
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
