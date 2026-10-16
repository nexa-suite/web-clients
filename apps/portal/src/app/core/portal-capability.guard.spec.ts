import { TestBed } from "@angular/core/testing";
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from "@angular/router";
import type { SessionResponse } from "@nexa/api";
import { PortalSessionStore } from "../contexts/tenant-access-governance/application/public-api";
import { PORTAL_ACCESS_RULES } from "./portal-access-policy";
import { requirePortalCapability } from "./portal-capability.guard";

describe("requirePortalCapability", () => {
  it("allows a direct read with the active grant, then redirects after revocation", () => {
    let current: SessionResponse | null = scopedPortalSession(["buyer.sales.read"]);
    const router = { createUrlTree: vi.fn((commands: string[]) => ({ commands })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: PortalSessionStore, useValue: { session: () => current } },
        { provide: Router, useValue: router },
      ],
    });
    const route = {
      data: { portalAccessRule: PORTAL_ACCESS_RULES.purchaseRequests },
    } as unknown as ActivatedRouteSnapshot;
    const routeState = { url: "/requests" } as RouterStateSnapshot;

    expect(TestBed.runInInjectionContext(() => requirePortalCapability(route, routeState))).toBe(true);

    current = scopedPortalSession([]);
    expect(TestBed.runInInjectionContext(() => requirePortalCapability(route, routeState))).toEqual({
      commands: ["/access/denied"],
    });
    expect(router.createUrlTree).toHaveBeenCalledWith(["/access/denied"]);
  });

  it("fails closed for a direct route when the active context is incomplete", () => {
    const router = { createUrlTree: vi.fn((commands: string[]) => ({ commands })) };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PortalSessionStore,
          useValue: { session: () => ({ surface: "PORTAL", membership: { permissions: ["buyer.sales.read"] } }) },
        },
        { provide: Router, useValue: router },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      requirePortalCapability({
        data: { portalAccessRule: PORTAL_ACCESS_RULES.purchaseRequests },
      } as unknown as ActivatedRouteSnapshot, { url: "/requests" } as RouterStateSnapshot),
    );

    expect(result).toEqual({ commands: ["/access/denied"] });
  });

  it("denies direct Buyer route when non-Buyer membership has Buyer and internal read grants", () => {
    const router = { createUrlTree: vi.fn((commands: string[]) => ({ commands })) };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PortalSessionStore,
          useValue: {
            session: () => scopedPortalSession(
              ["buyer.sales.read", "sales.purchase_request.read"],
              ["WORKSPACE_ADMIN"],
            ),
          },
        },
        { provide: Router, useValue: router },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      requirePortalCapability(
        {
          data: { portalAccessRule: PORTAL_ACCESS_RULES.purchaseRequests },
        } as unknown as ActivatedRouteSnapshot,
        { url: "/requests" } as RouterStateSnapshot,
      ),
    );

    expect(result).toEqual({ commands: ["/access/denied"] });
    expect(router.createUrlTree).toHaveBeenCalledWith(["/access/denied"]);
  });
});

function scopedPortalSession(
  permissions: readonly string[],
  roles: readonly string[] = ["BUYER"],
): SessionResponse {
  return {
    surface: "PORTAL",
    user: { userId: "user-1" },
    tenant: { tenantId: "tenant-1" },
    workspace: { workspaceId: "workspace-1" },
    membership: { membershipId: "membership-1", permissions, roles },
  };
}
