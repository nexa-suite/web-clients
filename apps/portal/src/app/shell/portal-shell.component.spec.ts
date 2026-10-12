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
      membership: { roles: ["BUYER"], permissions },
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
});
