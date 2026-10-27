import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, provideRouter } from "@angular/router";
import { of } from "rxjs";
import type { PurchaseRequestDetail, SessionResponse } from "@nexa/api";
import { NexaSalesCommitmentApi } from "@nexa/api";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerPurchaseRequestDetailPageComponent } from "./buyer-purchase-request-detail-page.component";

describe("BuyerPurchaseRequestDetailPageComponent", () => {
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
          useValue: { snapshot: { paramMap: { get: () => "request-1" } } },
        },
        { provide: NexaSalesCommitmentApi, useValue: { getPurchaseRequest: vi.fn(() => of({ body: request })) } },
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
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[routerLink="/requests"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/orders"]')).toBeNull();

    session.set(scopedPortalSession(["buyer.order.read"]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[routerLink="/requests"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/orders"]')).not.toBeNull();
  });
});

function scopedPortalSession(permissions: readonly string[]): SessionResponse {
  return {
    surface: "PORTAL",
    user: { userId: "user-1" },
    tenant: { tenantId: "tenant-1" },
    workspace: { workspaceId: "workspace-1" },
    membership: { membershipId: "membership-1", roles: ["BUYER"], permissions },
  };
}
