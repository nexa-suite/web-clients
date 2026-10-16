import { computed, signal } from "@angular/core";
import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { SessionResponse } from "@nexa/api";
import {
  PortalSessionStore,
  type PortalSessionState,
} from "../contexts/tenant-access-governance/application/public-api";
import { PortalBuyerEligibilityService } from "../contexts/customer-buyer-relationships/application/public-api";
import { PortalShellComponent } from "./portal-shell.component";

const TRACKING_READ = "buyer.tracking.read";

function authenticatedBuyer(permissions: readonly string[]): PortalSessionState {
  return {
    status: "authenticated",
    session: {
      surface: "PORTAL",
      user: { userId: "user-1" },
      tenant: { tenantId: "tenant-1" },
      workspace: { workspaceId: "workspace-1" },
      membership: { membershipId: "membership-1", roles: ["BUYER"], permissions },
    } as SessionResponse,
  };
}

function createShell(initialState: PortalSessionState) {
  const state = signal(initialState);
  const session = {
    state,
    session: computed(() => {
      const current = state();
      return current.status === "authenticated" || current.status === "signing-out"
        ? current.session
        : null;
    }),
    signOutError: signal(""),
    signOut: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [PortalShellComponent],
    providers: [
      provideRouter([]),
      { provide: PortalSessionStore, useValue: session },
      {
        provide: PortalBuyerEligibilityService,
        useValue: { currentAccount: signal(null) },
      },
    ],
  });

  const fixture = TestBed.createComponent(PortalShellComponent);
  fixture.detectChanges();
  return { fixture, state };
}

function deliveriesLink(fixture: ComponentFixture<PortalShellComponent>) {
  const nativeElement = fixture.nativeElement as HTMLElement;
  return Array.from(
    nativeElement.querySelectorAll<HTMLAnchorElement>(
      ".buyer-navigation a",
    ),
  ).find((link) => link.textContent?.trim() === "My deliveries");
}

describe("PortalShellComponent delivery navigation", () => {
  it("does not show My deliveries to an eligible Buyer without tracking permission", () => {
    const { fixture } = createShell(authenticatedBuyer(["buyer.sales.read"]));

    expect(deliveriesLink(fixture)).toBeUndefined();
  });

  it("shows My deliveries when the active Buyer session has the canonical tracking permission", () => {
    const { fixture } = createShell(authenticatedBuyer([TRACKING_READ]));

    expect(deliveriesLink(fixture)).toBeDefined();
  });

  it("hides My deliveries when the current session no longer has authority", () => {
    const { fixture, state } = createShell(authenticatedBuyer([TRACKING_READ]));
    expect(deliveriesLink(fixture)).toBeDefined();

    state.set({ status: "invalidated" });
    fixture.detectChanges();

    expect(deliveriesLink(fixture)).toBeUndefined();
  });

  it("shows separate Buyer pages only from capabilities returned for the active session", () => {
    const { fixture } = createShell(
      authenticatedBuyer([
        "catalog.read",
        "payment.read",
        "buyer.sales.read",
        "buyer.order.read",
        "document.read",
        TRACKING_READ,
      ]),
    );

    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        ".buyer-navigation a[routerLink]",
      ),
    );
    const targets = links.map((link) => link.getAttribute("routerlink"));
    expect(targets).toEqual([
      "/deliveries",
      "/catalog",
      "/wallet",
      "/requests",
      "/orders",
      "/documents",
    ]);
    expect(new Set(targets).size).toBe(targets.length);
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "My deliveries",
      "Catalog",
      "My wallet",
      "My requests",
      "My orders",
      "Documents",
    ]);
  });

  it("does not expose capability navigation from role names or incomplete scope", () => {
    const { fixture, state } = createShell(
      authenticatedBuyer(["catalog.read", "buyer.sales.read"]),
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '.buyer-navigation a[routerLink="/catalog"]',
      ),
    ).not.toBeNull();

    state.set({
      status: "authenticated",
      session: {
        surface: "PORTAL",
        membership: {
          roles: ["BUYER"],
          permissions: ["catalog.read", "buyer.sales.read"],
        },
      } as SessionResponse,
    });
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '.buyer-navigation a[routerLink]',
      ),
    ).toBeNull();
  });
});
