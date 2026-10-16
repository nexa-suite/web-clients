import type { SessionResponse } from "@nexa/api";

export interface PortalAccessRule {
  /** Each group is an OR; all groups must be satisfied. */
  readonly capabilities: readonly (readonly string[])[];
  /** When present, the active membership must include one of these roles. */
  readonly roles?: readonly string[];
}

export const PORTAL_ACCESS_RULES = {
  catalog: { capabilities: [["catalog.read"]], roles: ["BUYER"] },
  wallet: {
    capabilities: [["payment.read", "payment.create"]],
    roles: ["BUYER"],
  },
  purchaseRequests: {
    capabilities: [["buyer.sales.read"]],
    roles: ["BUYER"],
  },
  purchaseRequestWrite: {
    capabilities: [["buyer.sales.write"]],
    roles: ["BUYER"],
  },
  purchaseRequestDraft: {
    capabilities: [["buyer.sales.write"]],
    roles: ["BUYER"],
  },
  orders: { capabilities: [["buyer.order.read"]], roles: ["BUYER"] },
  documents: { capabilities: [["document.read"]], roles: ["BUYER"] },
  deliveries: { capabilities: [["buyer.tracking.read"]], roles: ["BUYER"] },
} as const satisfies Readonly<Record<string, PortalAccessRule>>;

export function canAccessPortalFeature(
  session: SessionResponse | null | undefined,
  rule: PortalAccessRule,
): boolean {
  if (!hasPortalScope(session) || !isValidRule(rule)) return false;
  const permissions = session.membership?.permissions ?? [];
  const hasRequiredRole =
    rule.roles === undefined ||
    rule.roles.some((role) => session.membership?.roles?.includes(role) === true);
  return (
    hasRequiredRole &&
    rule.capabilities.every((group) =>
      group.some((capability) => permissions.includes(capability)),
    )
  );
}

function hasPortalScope(
  session: SessionResponse | null | undefined,
): session is SessionResponse {
  return (
    session?.surface === "PORTAL" &&
    hasValue(session.user?.userId) &&
    hasValue(session.tenant?.tenantId) &&
    hasValue(session.workspace?.workspaceId) &&
    hasValue(session.membership?.membershipId)
  );
}

function isValidRule(rule: PortalAccessRule): boolean {
  return (
    Array.isArray(rule.capabilities) &&
    rule.capabilities.length > 0 &&
    (rule.roles === undefined ||
      (Array.isArray(rule.roles) &&
        rule.roles.length > 0 &&
        rule.roles.every((role) => hasValue(role)))) &&
    rule.capabilities.every(
      (group) =>
        Array.isArray(group) &&
        group.length > 0 &&
        group.every((capability) => hasValue(capability)),
    )
  );
}

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
