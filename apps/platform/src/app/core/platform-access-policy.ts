import type { SessionResponse } from "@nexa/api";

export interface PlatformAccessRule {
  /** Each group is an OR; all groups must be satisfied. */
  readonly capabilities: readonly (readonly string[])[];
  /** Optional server-returned membership roles required by accepted policy. */
  readonly roles?: readonly string[];
}

export const PLATFORM_ACCESS_RULES = {
  workforceAccess: { capabilities: [["tenant.member.read"]] },
  rolesAndPermissions: { capabilities: [["tenant.role.read"]] },
  supportConsent: { capabilities: [], roles: ["COMPANY_OWNER"] },
  warehouseAccess: {
    capabilities: [["tenant.role.assign"]],
    roles: ["COMPANY_OWNER", "TENANT_ADMIN"],
  },
  operationsOverview: {
    capabilities: [["logistics.read", "dispatch.read", "logistics.analytics.read", "logistics:read"]],
  },
  purchaseRequests: { capabilities: [["sales.purchase_request.read"]] },
  fulfillment: {
    capabilities: [["fulfillment.read", "fulfillment:read", "logistics.read", "dispatch.read", "logistics.analytics.read", "logistics:read"]],
  },
  documents: { capabilities: [["document.read"]] },
  orderSummaryGeneration: {
    capabilities: [["document.generate"], ["sales.order.read"]],
  },
  creditConfiguration: {
    capabilities: [["client.credit.configuration.manage"]],
    roles: ["BUSINESS_OPERATIONS_MANAGER", "COMPANY_OWNER"],
  },
  walletRefunds: {
    capabilities: [["payment.reconcile"]],
    roles: ["BUSINESS_OPERATIONS_MANAGER", "COMPANY_OWNER"],
  },
} as const satisfies Readonly<Record<string, PlatformAccessRule>>;

export function canAccessPlatformFeature(
  session: SessionResponse | null | undefined,
  rule: PlatformAccessRule,
): boolean {
  if (!hasPlatformScope(session) || !isValidRule(rule)) return false;

  const membership = session.membership;
  const permissions = membership?.permissions ?? [];
  if (
    !rule.capabilities.every((group) =>
      group.some((capability) => permissions.includes(capability)),
    )
  ) {
    return false;
  }

  return (
    !rule.roles ||
    rule.roles.some((role) => membership?.roles?.includes(role) === true)
  );
}

function hasPlatformScope(
  session: SessionResponse | null | undefined,
): session is SessionResponse {
  return (
    session?.surface === "PLATFORM" &&
    hasValue(session.user?.userId) &&
    hasValue(session.tenant?.tenantId) &&
    hasValue(session.workspace?.workspaceId) &&
    hasValue(session.membership?.membershipId)
  );
}

function isValidRule(rule: PlatformAccessRule): boolean {
  if (!Array.isArray(rule.capabilities)) return false;
  const hasCapabilityRule = rule.capabilities.length > 0;
  const hasRoleRule = Array.isArray(rule.roles) && rule.roles.length > 0;
  if (!hasCapabilityRule && !hasRoleRule) return false;
  return (
    rule.capabilities.every(
      (group) =>
        Array.isArray(group) &&
        group.length > 0 &&
        group.every((capability) => hasValue(capability)),
    ) &&
    (!rule.roles ||
      (Array.isArray(rule.roles) &&
        rule.roles.length > 0 &&
        rule.roles.every((role) => hasValue(role))))
  );
}

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
