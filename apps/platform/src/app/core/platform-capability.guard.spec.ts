import { TestBed } from "@angular/core/testing";
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from "@angular/router";
import type { SessionResponse } from "@nexa/api";
import { PlatformSessionStore } from "../contexts/tenant-access-governance/application/public-api";
import { PLATFORM_ACCESS_RULES } from "./platform-access-policy";
import { requirePlatformCapability } from "./platform-capability.guard";

describe("requirePlatformCapability", () => {
  it("allows direct reads with the active scoped grant and redirects when it is revoked", () => {
    let current: SessionResponse | null = scopedPlatformSession(["tenant.member.read"]);
    const router = { createUrlTree: vi.fn((commands: string[]) => ({ commands })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformSessionStore, useValue: { state: () => ({ status: "authenticated", session: current }) } },
        { provide: Router, useValue: router },
      ],
    });
    const route = {
      data: { platformAccessRule: PLATFORM_ACCESS_RULES.workforceAccess },
    } as unknown as ActivatedRouteSnapshot;
    const routeState = { url: "/organization/access" } as RouterStateSnapshot;

    expect(TestBed.runInInjectionContext(() => requirePlatformCapability(route, routeState))).toBe(true);

    current = scopedPlatformSession([]);
    expect(TestBed.runInInjectionContext(() => requirePlatformCapability(route, routeState))).toEqual({
      commands: ["/"],
    });
    expect(router.createUrlTree).toHaveBeenCalledWith(["/"]);
  });

  it("fails closed for a direct route when the active context is incomplete", () => {
    const router = { createUrlTree: vi.fn((commands: string[]) => ({ commands })) };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PlatformSessionStore,
          useValue: { state: () => ({ status: "authenticated", session: { surface: "PLATFORM", membership: { permissions: ["tenant.member.read"] } } }) },
        },
        { provide: Router, useValue: router },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      requirePlatformCapability({
        data: { platformAccessRule: PLATFORM_ACCESS_RULES.workforceAccess },
      } as unknown as ActivatedRouteSnapshot, { url: "/organization/access" } as RouterStateSnapshot),
    );

    expect(result).toEqual({ commands: ["/"] });
  });
});

function scopedPlatformSession(permissions: readonly string[]): SessionResponse {
  return {
    surface: "PLATFORM",
    user: { userId: "user-1" },
    tenant: { tenantId: "tenant-1" },
    workspace: { workspaceId: "workspace-1" },
    membership: { membershipId: "membership-1", permissions },
  };
}
