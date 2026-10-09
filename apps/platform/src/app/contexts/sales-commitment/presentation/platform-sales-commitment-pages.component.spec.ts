import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { signal } from "@angular/core";
import { NexaSalesCommitmentApi } from "@nexa/api";
import type { PurchaseRequestDetail, PurchaseRequestPage } from "@nexa/api";
import { of, Subject } from "rxjs";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformPurchaseRequestReviewStore } from "../application/platform-purchase-request-review.store";
import { PlatformPurchaseRequestInboxPageComponent } from "./platform-purchase-request-inbox-page.component";
import { PlatformPurchaseRequestReviewPageComponent } from "./platform-purchase-request-review-page.component";

describe("Platform Sales commitment pages", () => {
  const request: PurchaseRequestDetail = {
    id: "pr-1",
    code: "PR-0001",
    clientAccountId: "buyer-account-1",
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
  const requestPage: PurchaseRequestPage = {
    items: [{
      id: "pr-private-id",
      code: "PR-PRIVATE",
      clientAccountId: "buyer-account-private",
      status: "SUBMITTED",
      priority: "NORMAL",
      requestedDeliveryDate: "2026-10-20",
      lineCount: 1,
      version: 9,
    }],
    page: 0,
    size: 1,
    total: 2,
  };

  function inboxSetup(responses: readonly (PurchaseRequestPage | Subject<PurchaseRequestPage>)[]) {
    const leaseCurrent = signal(true);
    let call = 0;
    const api = {
      listPurchaseRequests: vi.fn(() => {
        const response = responses[call++] ?? responses.at(-1)!;
        return response instanceof Subject ? response.asObservable() : of(response);
      }),
    };
    const sessions = {
      captureSessionLease: vi.fn(() => ({ epoch: 1, scope: { userId: "u", tenantId: "t", workspaceId: "w", membershipId: "m", surface: "PLATFORM" as const } })),
      isSessionLeaseCurrent: vi.fn(() => leaseCurrent()),
    };
    TestBed.configureTestingModule({
      imports: [PlatformPurchaseRequestInboxPageComponent],
      providers: [
        provideRouter([]),
        { provide: NexaSalesCommitmentApi, useValue: api },
        { provide: PlatformSessionStore, useValue: sessions },
      ],
    });
    const fixture = TestBed.createComponent(PlatformPurchaseRequestInboxPageComponent);
    fixture.detectChanges();
    return { fixture, api, leaseCurrent };
  }

  it("loads an inbox from canonical submitted and changed request lists", async () => {
    const api = { listPurchaseRequests: vi.fn().mockReturnValue(of({ items: [], page: 0, size: 50, total: 0 })) };
    const sessions = {
      captureSessionLease: vi.fn(() => ({ epoch: 1, scope: { userId: "u", tenantId: "t", workspaceId: "w", membershipId: "m", surface: "PLATFORM" as const } })),
      isSessionLeaseCurrent: vi.fn(() => true),
    };
    TestBed.configureTestingModule({
      imports: [PlatformPurchaseRequestInboxPageComponent],
      providers: [
        provideRouter([]),
        { provide: NexaSalesCommitmentApi, useValue: api },
        { provide: PlatformSessionStore, useValue: sessions },
      ],
    });
    const fixture = TestBed.createComponent(PlatformPurchaseRequestInboxPageComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("No submitted purchase requests are awaiting a Sales decision.");
    });

    expect(api.listPurchaseRequests).toHaveBeenCalledTimes(2);
    expect(api.listPurchaseRequests).toHaveBeenCalledWith(expect.objectContaining({ status: "SUBMITTED" }));
    expect(api.listPurchaseRequests).toHaveBeenCalledWith(expect.objectContaining({ status: "CHANGES_PROPOSED" }));
  });

  it("masks already-loaded Buyer account data immediately after the Platform lease expires", async () => {
    const { fixture, leaseCurrent } = inboxSetup([requestPage]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("PR-PRIVATE");
      expect(fixture.nativeElement.textContent).toContain("buyer-account-private");
    });

    leaseCurrent.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("PR-PRIVATE");
    expect(fixture.nativeElement.textContent).not.toContain("buyer-account-private");
    expect(fixture.nativeElement.textContent).toContain("Your Platform context changed");
  });

  it("ignores inbox responses that arrive after the Platform lease expires", async () => {
    const pending = new Subject<PurchaseRequestPage>();
    const { fixture, leaseCurrent } = inboxSetup([pending, pending]);
    await Promise.resolve();
    leaseCurrent.set(false);
    pending.next(requestPage);
    pending.complete();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("PR-PRIVATE");
    expect(fixture.nativeElement.textContent).not.toContain("buyer-account-private");
    expect(fixture.nativeElement.textContent).toContain("Your Platform context changed");
  });

  it("loads the next inbox page using the server page metadata", async () => {
    const secondPage: PurchaseRequestPage = {
      ...requestPage,
      items: [{ ...requestPage.items[0], id: "pr-page-two", code: "PR-PAGE-TWO" }],
      page: 1,
    };
    const { fixture, api } = inboxSetup([
      requestPage,
      { ...requestPage, items: [], total: 0 },
      secondPage,
      { ...requestPage, items: [], total: 0 },
    ]);
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

    expect(api.listPurchaseRequests).toHaveBeenNthCalledWith(3, expect.objectContaining({ status: "SUBMITTED", page: 1, size: 50 }));
    expect(api.listPurchaseRequests).toHaveBeenNthCalledWith(4, expect.objectContaining({ status: "CHANGES_PROPOSED", page: 1, size: 50 }));
  });

  it("renders the API-owned request state and review decision actions", async () => {
    const leaseCurrent = signal(true);
    const lease = { epoch: 1, scope: { userId: "u", tenantId: "t", workspaceId: "w", membershipId: "m", surface: "PLATFORM" as const } };
    const state = signal({
      status: "ready" as const,
      request,
      order: null,
      pendingAction: null,
      pendingNote: "",
      message: null,
    });
    const store = {
      state,
      load: vi.fn().mockResolvedValue(undefined),
      convert: vi.fn().mockResolvedValue(undefined),
      reject: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [PlatformPurchaseRequestReviewPageComponent],
      providers: [
        provideRouter([]),
        { provide: PlatformPurchaseRequestReviewStore, useValue: store },
        { provide: PlatformSessionStore, useValue: { captureSessionLease: () => lease, isSessionLeaseCurrent: () => leaseCurrent() } },
      ],
    });
    const fixture = TestBed.createComponent(PlatformPurchaseRequestReviewPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.load).toHaveBeenCalledWith("");
    expect(fixture.nativeElement.textContent).toContain("PR-0001");
    expect(fixture.nativeElement.textContent).toContain("Convert to order");
    expect(fixture.nativeElement.textContent).toContain("Reject request");
    expect(fixture.nativeElement.textContent).not.toContain("Approve request");

    const noteInput = fixture.nativeElement.querySelector("textarea") as HTMLTextAreaElement;
    noteInput.value = "private Sales review note";
    noteInput.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    expect(noteInput.value).toBe("private Sales review note");

    leaseCurrent.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(noteInput.value).toBe("");
    expect((fixture.componentInstance as unknown as { reviewNote: () => string }).reviewNote()).toBe("");
  });

  it("waits for Buyer acceptance before showing Sales conversion for proposed changes", async () => {
    const proposedRequest = { ...request, status: "CHANGES_PROPOSED" };
    const store = {
      state: signal({
        status: "ready" as const,
        request: proposedRequest,
        order: null,
        pendingAction: null,
        pendingNote: "",
        message: null,
      }),
      load: vi.fn().mockResolvedValue(undefined),
      convert: vi.fn().mockResolvedValue(undefined),
      reject: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [PlatformPurchaseRequestReviewPageComponent],
      providers: [
        provideRouter([]),
        { provide: PlatformPurchaseRequestReviewStore, useValue: store },
        { provide: PlatformSessionStore, useValue: { captureSessionLease: () => null, isSessionLeaseCurrent: () => false } },
      ],
    });
    const fixture = TestBed.createComponent(PlatformPurchaseRequestReviewPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("A Buyer must accept proposed changes before Sales can convert this request.");
    expect(fixture.nativeElement.textContent).not.toContain("Convert to order");
    expect(fixture.nativeElement.textContent).toContain("Reject request");
  });
});
