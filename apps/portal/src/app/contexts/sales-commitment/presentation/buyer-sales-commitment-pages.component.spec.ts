import { signal, type WritableSignal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, provideRouter } from "@angular/router";
import { NexaSalesCommitmentApi } from "@nexa/api";
import type { PurchaseRequestDetail, SalesOrder, SalesOrderPage } from "@nexa/api";
import { of } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerPurchaseRequestDetailPageComponent } from "./buyer-purchase-request-detail-page.component";
import { BuyerSalesOrderDetailPageComponent } from "./buyer-sales-order-detail-page.component";
import { BuyerSalesOrdersPageComponent } from "./buyer-sales-orders-page.component";

describe("Buyer Sales Commitment pages", () => {
  const request: PurchaseRequestDetail = {
    id: "pr-private-id",
    code: "PR-PRIVATE",
    clientAccountId: "buyer-account-private",
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
  const order: SalesOrder = {
    id: "order-private-id",
    number: "SO-PRIVATE",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    clientAccountId: "buyer-account-private",
    createdByMembershipId: "sales-membership-1",
    buyerMembershipId: "buyer-membership-1",
    sourcePurchaseRequestId: "pr-private-id",
    priority: "NORMAL",
    requestedDeliveryDate: "2026-10-20",
    deliverySnapshot: null,
    paymentOption: "BANK_TRANSFER",
    notes: null,
    currency: "USD",
    total: "125.00",
    status: "CONFIRMED",
    createdAt: "2026-10-09T00:00:00Z",
    updatedAt: "2026-10-09T00:00:00Z",
    confirmedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    rejectionReason: null,
    version: 1,
    lines: [],
    originType: null,
    commercialCommitmentId: null,
  };
  const orderPage: SalesOrderPage = { items: [order], page: 0, size: 50, total: 1 };

  function sessionProvider(leaseCurrent: WritableSignal<boolean>) {
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
    return {
      provide: PortalSessionStore,
      useValue: {
        captureSessionLease: vi.fn(() => lease),
        isSessionLeaseCurrent: vi.fn(() => leaseCurrent()),
      },
    };
  }

  it("masks an already loaded purchase request when the Buyer session lease expires", async () => {
    const leaseCurrent = signal(true);
    const api = { getPurchaseRequest: vi.fn().mockReturnValue(of({ body: request })) };
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => request.id } } } },
        { provide: NexaSalesCommitmentApi, useValue: api },
        sessionProvider(leaseCurrent),
      ],
    });
    const fixture = TestBed.createComponent(BuyerPurchaseRequestDetailPageComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("PR-PRIVATE");
    });
    const loadedState = (fixture.componentInstance as unknown as { state: () => { readonly request: PurchaseRequestDetail | null } }).state();
    expect(loadedState.request?.clientAccountId).toBe("buyer-account-private");

    leaseCurrent.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("PR-PRIVATE");
    expect(fixture.nativeElement.textContent).toContain("Your Buyer context changed");
    const maskedState = (fixture.componentInstance as unknown as { state: () => { readonly request: PurchaseRequestDetail | null } }).state();
    expect(maskedState.request).toBeNull();
  });

  it("masks loaded order list data when the Buyer session lease expires", async () => {
    const leaseCurrent = signal(true);
    const api = { listSalesOrders: vi.fn().mockReturnValue(of(orderPage)) };
    TestBed.configureTestingModule({
      imports: [BuyerSalesOrdersPageComponent],
      providers: [provideRouter([]), { provide: NexaSalesCommitmentApi, useValue: api }, sessionProvider(leaseCurrent)],
    });
    const fixture = TestBed.createComponent(BuyerSalesOrdersPageComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("SO-PRIVATE");
    });
    const loadedState = (fixture.componentInstance as unknown as { state: () => { readonly page: SalesOrderPage | null } }).state();
    expect(loadedState.page?.items[0]?.clientAccountId).toBe("buyer-account-private");

    leaseCurrent.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("SO-PRIVATE");
    expect(fixture.nativeElement.textContent).toContain("Your Buyer context changed");
    const maskedState = (fixture.componentInstance as unknown as { state: () => { readonly page: SalesOrderPage | null } }).state();
    expect(maskedState.page).toBeNull();
  });

  it("masks an already loaded sales order when the Buyer session lease expires", async () => {
    const leaseCurrent = signal(true);
    const api = { getSalesOrder: vi.fn().mockReturnValue(of({ body: order })) };
    TestBed.configureTestingModule({
      imports: [BuyerSalesOrderDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => order.id } } } },
        { provide: NexaSalesCommitmentApi, useValue: api },
        sessionProvider(leaseCurrent),
      ],
    });
    const fixture = TestBed.createComponent(BuyerSalesOrderDetailPageComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("SO-PRIVATE");
    });
    const loadedState = (fixture.componentInstance as unknown as { state: () => { readonly order: SalesOrder | null } }).state();
    expect(loadedState.order?.clientAccountId).toBe("buyer-account-private");

    leaseCurrent.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("SO-PRIVATE");
    expect(fixture.nativeElement.textContent).toContain("Your Buyer context changed");
    const maskedState = (fixture.componentInstance as unknown as { state: () => { readonly order: SalesOrder | null } }).state();
    expect(maskedState.order).toBeNull();
  });
});
