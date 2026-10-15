import type { SessionResponse } from "@nexa/api";
import {
  canAccessPlatformFeature,
  PLATFORM_ACCESS_RULES,
} from "./platform-access-policy";

function platformSession(
  overrides: Partial<SessionResponse> = {},
): SessionResponse {
  return {
    ...overrides,
    surface: overrides.surface ?? "PLATFORM",
    user: { userId: "user-1", ...overrides.user },
    tenant: { tenantId: "tenant-1", ...overrides.tenant },
    workspace: { workspaceId: "workspace-1", ...overrides.workspace },
    membership: { membershipId: "membership-1", ...overrides.membership },
  };
}

describe("Platform access policy", () => {
  it("fails closed when active surface or scope is missing", () => {
    expect(
      canAccessPlatformFeature(
        platformSession({
          surface: "PORTAL",
          membership: { permissions: ["tenant.member.read"] },
        }),
        PLATFORM_ACCESS_RULES.workforceAccess,
      ),
    ).toBe(false);
    expect(
      canAccessPlatformFeature(
        {
          surface: "PLATFORM",
          membership: { permissions: ["tenant.member.read"] },
        },
        PLATFORM_ACCESS_RULES.workforceAccess,
      ),
    ).toBe(false);
  });

  it("uses exact API capabilities and accepted active roles", () => {
    expect(
      canAccessPlatformFeature(
        platformSession({
          membership: {
            roles: ["COMPANY_OWNER"],
            permissions: ["client.credit.configuration.manage"],
          },
        }),
        PLATFORM_ACCESS_RULES.creditConfiguration,
      ),
    ).toBe(true);
    expect(
      canAccessPlatformFeature(
        platformSession({
          membership: {
            roles: ["TENANT_ADMIN"],
            permissions: ["client.credit.configuration.manage"],
          },
        }),
        PLATFORM_ACCESS_RULES.creditConfiguration,
      ),
    ).toBe(false);
    expect(
      canAccessPlatformFeature(
        platformSession({
          membership: { roles: ["LOGISTICS"], permissions: ["document:read"] },
        }),
        PLATFORM_ACCESS_RULES.documents,
      ),
    ).toBe(false);
  });

  it("keeps inventory read, receiving and catalog read permissions independent", () => {
    const scope = platformSession({ membership: { permissions: ["warehouse:read"] } });
    expect(canAccessPlatformFeature(scope, PLATFORM_ACCESS_RULES.inventory)).toBe(true);
    expect(canAccessPlatformFeature(scope, PLATFORM_ACCESS_RULES.inventoryReceive)).toBe(false);
    expect(canAccessPlatformFeature(scope, PLATFORM_ACCESS_RULES.inventoryCatalog)).toBe(false);

    const receiver = platformSession({ membership: { permissions: ["warehouse:read", "warehouse:write", "catalog:read"] } });
    expect(canAccessPlatformFeature(receiver, PLATFORM_ACCESS_RULES.inventory)).toBe(true);
    expect(canAccessPlatformFeature(receiver, PLATFORM_ACCESS_RULES.inventoryReceive)).toBe(true);
    expect(canAccessPlatformFeature(receiver, PLATFORM_ACCESS_RULES.inventoryCatalog)).toBe(true);

    expect(canAccessPlatformFeature(
      platformSession({ membership: { permissions: ["catalog:read", "warehouse:write"] } }),
      PLATFORM_ACCESS_RULES.inventory,
    )).toBe(false);
  });

  it("opens catalog management from a server-issued product grant and ignores the role label", () => {
    expect(
      canAccessPlatformFeature(
        platformSession({
          membership: {
            roles: ["BUSINESS_OPERATIONS_MANAGER"],
            permissions: ["catalog.read", "catalog.product.manage"],
          },
        }),
        PLATFORM_ACCESS_RULES.catalogManagement,
      ),
    ).toBe(true);
    expect(
      canAccessPlatformFeature(
        platformSession({
          membership: {
            roles: ["BUSINESS_OPERATIONS_MANAGER"],
            permissions: ["catalog.read", "sales.order.read"],
          },
        }),
        PLATFORM_ACCESS_RULES.catalogManagement,
      ),
    ).toBe(false);
  });

  it("requires all capabilities for order-summary generation", () => {
    expect(
      canAccessPlatformFeature(
        platformSession({
          membership: { permissions: ["document.generate"] },
        }),
        PLATFORM_ACCESS_RULES.orderSummaryGeneration,
      ),
    ).toBe(false);
    expect(
      canAccessPlatformFeature(
        platformSession({
          membership: {
            permissions: ["document.generate", "sales.order.read"],
          },
        }),
        PLATFORM_ACCESS_RULES.orderSummaryGeneration,
      ),
    ).toBe(true);
  });

  it("keeps Company Owner-only consent separate from general tenant-read permission", () => {
    expect(
      canAccessPlatformFeature(
        platformSession({
          membership: { roles: ["TENANT_ADMIN"], permissions: ["tenant:read"] },
        }),
        PLATFORM_ACCESS_RULES.supportConsent,
      ),
    ).toBe(false);
    expect(
      canAccessPlatformFeature(
        platformSession({ membership: { roles: ["COMPANY_OWNER"] } }),
        PLATFORM_ACCESS_RULES.supportConsent,
      ),
    ).toBe(true);
  });
});
