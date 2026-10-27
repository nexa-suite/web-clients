import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { of } from "rxjs";
import type { MaterialChangeProposal, PurchaseRequestDetail, PurchaseRequestEvent, SessionResponse } from "@nexa/api";
import { NexaCommandRetryStore, NexaSalesCommitmentApi } from "@nexa/api";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerPurchaseRequestDetailPageComponent } from "./buyer-purchase-request-detail-page.component";

describe("BuyerPurchaseRequestDetailPageComponent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows only destinations granted to the active membership and reacts to revocation", async () => {
    const session = signal<SessionResponse | null>(scopedPortalSession([
      "buyer.sales.read",
    ]));
    const request = {
      id: "request-1",
      status: "CONVERTED",
      lines: [],
    } as unknown as PurchaseRequestDetail;
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestDetailPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => "request-1" } },
            paramMap: of(convertToParamMap({ requestId: "request-1" })),
          },
        },
        {
          provide: NexaSalesCommitmentApi,
          useValue: {
            getPurchaseRequest: vi.fn(() => of({ body: request, headers: { get: () => null } })),
            listPurchaseRequestEvents: vi.fn(() => of([])),
          },
        },
        {
          provide: PortalSessionStore,
          useValue: {
            state: () => ({ status: "authenticated", session: session() }),
            captureSessionLease: () => ({ epoch: 1, scope: {
              userId: "user-1", tenantId: "tenant-1", workspaceId: "workspace-1",
              membershipId: "membership-1", surface: "PORTAL",
            } }),
            isSessionLeaseCurrent: () => true,
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(BuyerPurchaseRequestDetailPageComponent);
    fixture.detectChanges();
    await flushAsyncTasks();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[routerLink="/requests"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/orders"]')).toBeNull();

    session.set(scopedPortalSession(["buyer.order.read"]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[routerLink="/requests"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/orders"]')).not.toBeNull();
  });

  it("reviews the current proposal and event timeline, then accepts with the request ETag", async () => {
    const session = signal<SessionResponse | null>(scopedPortalSession([
      "buyer.sales.read",
      "buyer.sales.write",
    ]));
    const request = {
      id: "request-1",
      code: "PR-0001",
      status: "CHANGES_PROPOSED",
      version: 4,
      requestedDeliveryDate: "2026-11-02",
      paymentOption: "BANK_TRANSFER",
      reviewNote: null,
      expiresAt: null,
      lines: [],
    } as unknown as PurchaseRequestDetail;
    const acceptedRequest = {
      ...request,
      status: "SUBMITTED",
      version: 5,
    } as PurchaseRequestDetail;
    const proposal = {
      id: "proposal-1",
      purchaseRequestId: "request-1",
      status: "PROPOSED",
      requestVersion: 4,
      proposedByMembershipId: "sales-membership",
      resolvedByMembershipId: null,
      reason: "Requested item is no longer available.",
      proposedAt: "2026-10-27T10:00:00Z",
      resolvedAt: null,
      resolvedRequestVersion: null,
      originalTerms: {
        priority: "NORMAL",
        requestedDeliveryDate: "2026-11-02",
        deliveryProfileSnapshot: null,
        paymentOption: "BANK_TRANSFER",
        comment: null,
        lines: [],
      },
      proposedTerms: {
        priority: "NORMAL",
        requestedDeliveryDate: "2026-11-04",
        deliveryProfileSnapshot: null,
        paymentOption: "BANK_TRANSFER",
        comment: null,
        lines: [],
      },
    } as MaterialChangeProposal;
    const events: readonly PurchaseRequestEvent[] = [
      {
        eventId: "event-2",
        eventType: "CHANGES_PROPOSED",
        fromStatus: "SUBMITTED",
        toStatus: "CHANGES_PROPOSED",
        actorMembershipId: "sales-membership",
        occurredAt: "2026-10-27T12:00:00Z",
      },
      {
        eventId: "event-1",
        eventType: "SUBMITTED",
        fromStatus: null,
        toStatus: "SUBMITTED",
        actorMembershipId: "buyer-membership",
        occurredAt: "2026-10-27T09:00:00Z",
      },
    ];
    const lease = { epoch: 1, scope: {
      userId: "user-1", tenantId: "tenant-1", workspaceId: "workspace-1",
      membershipId: "membership-1", surface: "PORTAL",
    } };
    const api = {
      getPurchaseRequest: vi.fn()
        .mockReturnValueOnce(of({ body: request, headers: { get: () => '"4"' } }))
        .mockReturnValue(of({ body: acceptedRequest, headers: { get: () => '"5"' } })),
      listPurchaseRequestEvents: vi.fn(() => of(events)),
      getCurrentMaterialChange: vi.fn(() => of(proposal)),
      acceptPurchaseRequestMaterialChange: vi.fn(() =>
        of({ body: acceptedRequest, headers: { get: () => '"5"' } }),
      ),
    };
    const retryCommands = {
      read: vi.fn(() => null),
      write: vi.fn(),
      remove: vi.fn(),
    };
    vi.stubGlobal("crypto", {
      subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer) },
      randomUUID: vi.fn(() => "123e4567-e89b-42d3-a456-426614174000"),
    });
    TestBed.configureTestingModule({
      imports: [BuyerPurchaseRequestDetailPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => "request-1" } },
            paramMap: of(convertToParamMap({ requestId: "request-1" })),
          },
        },
        { provide: NexaSalesCommitmentApi, useValue: api },
        { provide: NexaCommandRetryStore, useValue: retryCommands },
        {
          provide: PortalSessionStore,
          useValue: {
            state: () => ({ status: "authenticated", session: session() }),
            captureSessionLease: () => lease,
            isSessionLeaseCurrent: () => true,
            expireSessionIfCurrent: vi.fn(),
            invalidateContextIfCurrent: vi.fn(),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(BuyerPurchaseRequestDetailPageComponent);
    fixture.detectChanges();
    await flushAsyncTasks();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Proposed material changes");
    expect(fixture.nativeElement.textContent).toContain("Requested item is no longer available.");
    const timeline = fixture.nativeElement.querySelector(
      '[aria-label="Purchase request events"]',
    ) as HTMLElement;
    const timelineItems = Array.from(timeline.querySelectorAll("li"));
    const eventTypes = timelineItems.map((item) =>
      item.querySelector("strong")?.textContent?.trim(),
    );
    expect(eventTypes).toEqual(["SUBMITTED", "CHANGES PROPOSED"]);

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
    );
    const acceptButton = buttons
      .find((button) => button.textContent?.includes("Accept proposed terms"));
    expect(acceptButton).toBeDefined();
    (acceptButton as HTMLButtonElement).click();
    fixture.detectChanges();
    const confirmButton = Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === "Confirm");
    expect(confirmButton).toBeDefined();
    (confirmButton as HTMLButtonElement).click();
    await flushAsyncTasks();
    fixture.detectChanges();

    expect(api.acceptPurchaseRequestMaterialChange).toHaveBeenCalledWith(
      "request-1",
      "proposal-1",
      '"4"',
      expect.stringMatching(/^buyer-pr-command-/),
    );
    expect(retryCommands.write).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain("The material changes were accepted.");
  });
});

async function flushAsyncTasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function scopedPortalSession(permissions: readonly string[]): SessionResponse {
  return {
    surface: "PORTAL",
    user: { userId: "user-1" },
    tenant: { tenantId: "tenant-1" },
    workspace: { workspaceId: "workspace-1" },
    membership: { membershipId: "membership-1", roles: ["BUYER"], permissions },
  };
}
