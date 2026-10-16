import type { SessionResponse } from "@nexa/api";
import {
  canAccessPortalFeature,
  PORTAL_ACCESS_RULES,
} from "./portal-access-policy";

function portalSession(
  overrides: Partial<SessionResponse> = {},
): SessionResponse {
  return {
    ...overrides,
    surface: overrides.surface ?? "PORTAL",
    user: { userId: "user-1", ...overrides.user },
    tenant: { tenantId: "tenant-1", ...overrides.tenant },
    workspace: { workspaceId: "workspace-1", ...overrides.workspace },
    membership: { membershipId: "membership-1", ...overrides.membership },
  };
}

describe("Portal access policy", () => {
  it("requires Portal surface and complete active membership scope", () => {
    expect(
      canAccessPortalFeature(
        portalSession({
          surface: "PLATFORM",
          membership: { permissions: ["catalog.read"] },
        }),
        PORTAL_ACCESS_RULES.catalog,
      ),
    ).toBe(false);
    expect(
      canAccessPortalFeature(
        {
          surface: "PORTAL",
          membership: { permissions: ["catalog.read"] },
        },
        PORTAL_ACCESS_RULES.catalog,
      ),
    ).toBe(false);
  });

  it("shows only destinations granted to the active membership", () => {
    const session = portalSession({
      membership: { roles: ["BUYER"], permissions: ["buyer.sales.read"] },
    });
    expect(canAccessPortalFeature(session, PORTAL_ACCESS_RULES.purchaseRequests)).toBe(true);
    expect(canAccessPortalFeature(session, PORTAL_ACCESS_RULES.orders)).toBe(false);
    expect(canAccessPortalFeature(session, PORTAL_ACCESS_RULES.wallet)).toBe(false);
  });

  it("requires buyer request-write permission for draft routes", () => {
    expect(
      canAccessPortalFeature(
        portalSession({
          membership: { roles: ["BUYER"], permissions: ["buyer.sales.read"] },
        }),
        PORTAL_ACCESS_RULES.purchaseRequestDraft,
      ),
    ).toBe(false);
    expect(
      canAccessPortalFeature(
        portalSession({
          membership: { roles: ["BUYER"], permissions: ["buyer.sales.write"] },
        }),
        PORTAL_ACCESS_RULES.purchaseRequestDraft,
      ),
    ).toBe(true);
  });

  it("admits the composite wallet route only with read or create payment permission", () => {
    expect(
      canAccessPortalFeature(
        portalSession({
          membership: { roles: ["BUYER"], permissions: ["payment.read"] },
        }),
        PORTAL_ACCESS_RULES.wallet,
      ),
    ).toBe(true);
    expect(
      canAccessPortalFeature(
        portalSession({
          membership: { roles: ["BUYER"], permissions: ["payment.create"] },
        }),
        PORTAL_ACCESS_RULES.wallet,
      ),
    ).toBe(true);
    expect(
      canAccessPortalFeature(
        portalSession({ membership: { permissions: ["buyer.sales.read"] } }),
        PORTAL_ACCESS_RULES.wallet,
      ),
    ).toBe(false);
  });

  it("denies wallet access to non-Buyer memberships even when payment is granted", () => {
    expect(
      canAccessPortalFeature(
        portalSession({
          membership: { roles: ["WORKSPACE_ADMIN"], permissions: ["payment.read"] },
        }),
        PORTAL_ACCESS_RULES.wallet,
      ),
    ).toBe(false);
    expect(
      canAccessPortalFeature(
        portalSession({ membership: { permissions: ["payment.create"] } }),
        PORTAL_ACCESS_RULES.wallet,
      ),
    ).toBe(false);
  });

  it("denies Buyer feature grants to memberships without the Buyer role", () => {
    const session = portalSession({
      membership: {
        roles: ["WORKSPACE_ADMIN"],
        permissions: [
          "catalog.read",
          "buyer.sales.read",
          "buyer.sales.write",
          "buyer.order.read",
          "document.read",
          "buyer.tracking.read",
        ],
      },
    });

    for (const rule of [
      PORTAL_ACCESS_RULES.catalog,
      PORTAL_ACCESS_RULES.purchaseRequests,
      PORTAL_ACCESS_RULES.purchaseRequestWrite,
      PORTAL_ACCESS_RULES.purchaseRequestDraft,
      PORTAL_ACCESS_RULES.orders,
      PORTAL_ACCESS_RULES.documents,
      PORTAL_ACCESS_RULES.deliveries,
    ]) {
      expect(canAccessPortalFeature(session, rule)).toBe(false);
    }
  });
});
