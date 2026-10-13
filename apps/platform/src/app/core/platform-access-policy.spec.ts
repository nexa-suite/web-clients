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
