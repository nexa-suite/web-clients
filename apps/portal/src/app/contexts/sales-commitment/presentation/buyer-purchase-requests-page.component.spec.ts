import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NexaSalesCommitmentApi } from "@nexa/api";
import type { PurchaseRequestDraftPage, PurchaseRequestPage } from "@nexa/api";
import { of, Subject } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerPurchaseRequestsPageComponent } from "./buyer-purchase-requests-page.component";

describe("BuyerPurchaseRequestsPageComponent", () => {
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
  const requestPage: PurchaseRequestPage = {
    items: [{
      id: "pr-private-id",
      code: "PR-PRIVATE",
      clientAccountId: "buyer-account-private",
      status: "SUBMITTED",
      priority: "NORMAL",
      requestedDeliveryDate: "2026-10-23",
      lineCount: 1,
      version: 3,
    }],
    page: 0,
    size: 1,
    total: 2,
  };
  const draftPage: PurchaseRequestDraftPage = {
    items: [],
    page: 0,
    size: 50,
    totalItems: 0,
    totalPages: 0,
  };

  function setup(requests: Subject<PurchaseRequestPage> | PurchaseRequestPage = requestPage) {
    const leaseCurrent = signal(true);
    const api = {
      listDrafts: vi.fn().mockReturnValue(of(draftPage)),
      listPurchaseRequests: vi.fn().mockReturnValue(requests instanceof Subject ? requests : of(requests)),
    };
    const sessions = {
      captureSessionLease: vi.fn(() => lease),
      isSessionLeaseCurrent: vi.fn(() => leaseCurrent()),
    };
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestsPageComponent],
      providers: [
        provideRouter([]),
        { provide: NexaSalesCommitmentApi, useValue: api },
        { provide: PortalSessionStore, useValue: sessions },
      ],
    });
    const fixture = TestBed.createComponent(BuyerPurchaseRequestsPageComponent);
    fixture.detectChanges();
    return { fixture, api, leaseCurrent };
  }

  it("masks a loaded Buyer request as soon as its session lease is invalidated", async () => {
    const { fixture, leaseCurrent } = setup();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("PR-PRIVATE");
    });
    const loadedState = (fixture.componentInstance as unknown as { state: () => { readonly requests: PurchaseRequestPage | null } }).state();
    expect(loadedState.requests?.items[0]?.clientAccountId).toBe("buyer-account-private");

    leaseCurrent.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("PR-PRIVATE");
    expect(fixture.nativeElement.textContent).toContain("Your Buyer context changed");
    const maskedState = (fixture.componentInstance as unknown as { state: () => { readonly requests: PurchaseRequestPage | null } }).state();
    expect(maskedState.requests).toBeNull();
  });

  it("does not reveal a late list response from an invalidated Buyer context", async () => {
    const pending = new Subject<PurchaseRequestPage>();
    const { fixture, leaseCurrent } = setup(pending);
    await Promise.resolve();
    leaseCurrent.set(false);
    pending.next(requestPage);
    pending.complete();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("PR-PRIVATE");
    expect(fixture.nativeElement.textContent).toContain("Your Buyer context changed");
    const maskedState = (fixture.componentInstance as unknown as { state: () => { readonly requests: PurchaseRequestPage | null } }).state();
    expect(maskedState.requests).toBeNull();
  });

  it("loads earlier and later purchase request pages from the server-provided page metadata", async () => {
    const laterPage = { ...requestPage, items: [{ ...requestPage.items[0], id: "pr-page-two", code: "PR-PAGE-TWO" }], page: 1 };
    const api = {
      listDrafts: vi.fn().mockReturnValue(of(draftPage)),
      listPurchaseRequests: vi.fn()
        .mockReturnValueOnce(of(requestPage))
        .mockReturnValueOnce(of(laterPage)),
    };
    const sessions = {
      captureSessionLease: vi.fn(() => lease),
      isSessionLeaseCurrent: vi.fn(() => true),
    };
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestsPageComponent],
      providers: [
        provideRouter([]),
        { provide: NexaSalesCommitmentApi, useValue: api },
        { provide: PortalSessionStore, useValue: sessions },
      ],
    });
    const fixture = TestBed.createComponent(BuyerPurchaseRequestsPageComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("PR-PRIVATE");
    });

    const next = Array.from(fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>)
      .find((button) => (button.textContent ?? "").includes("Next requests"));
    expect(next).toBeDefined();
    next!.click();
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("PR-PAGE-TWO");
    });
    expect(api.listPurchaseRequests).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 1, size: 50 }));
  });
});
