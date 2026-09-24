export type PlatformCapabilityAuthority =
  | 'COMMAND'
  | 'QUERY'
  | 'OVERSIGHT'
  | 'EXCEPTION AUTHORITY';

export interface PlatformCapabilitySummary {
  readonly id: string;
  readonly label: string;
  readonly authorities: readonly PlatformCapabilityAuthority[];
}

export type PlatformActorId =
  | 'company-owner'
  | 'tenant-administrator'
  | 'business-operations-manager'
  | 'sales-representative'
  | 'warehouse-operator'
  | 'dispatch-coordinator'
  | 'nexa-commercial-onboarding-staff';

export interface PlatformActorPresentation {
  readonly id: PlatformActorId;
  readonly name: string;
  readonly kind: 'workforce' | 'support-boundary';
  readonly apiRoleCode: string | null;
  readonly apiRoleMapping: 'label-only' | 'unavailable' | 'not-a-workforce-role';
  readonly capabilities: readonly PlatformCapabilitySummary[];
  readonly note?: string;
}

const capability = (
  id: string,
  label: string,
  ...authorities: PlatformCapabilityAuthority[]
): PlatformCapabilitySummary => ({ id, label, authorities });

/**
 * Informational Product projection from Blueprint's role-capability matrix.
 * It is not consulted by guards, routes, or action authorization.
 */
export const CANONICAL_PLATFORM_ACTORS: readonly PlatformActorPresentation[] = [
  {
    id: 'company-owner',
    name: 'Company Owner',
    kind: 'workforce',
    apiRoleCode: 'COMPANY_OWNER',
    apiRoleMapping: 'label-only',
    capabilities: [
      capability('CAP-01', 'Acquisition and assisted onboarding', 'EXCEPTION AUTHORITY'),
      capability('CAP-02', 'Workforce access and governance', 'EXCEPTION AUTHORITY'),
      capability('CAP-03', 'Customer accounts and buyer relationships', 'OVERSIGHT', 'EXCEPTION AUTHORITY'),
      capability('CAP-04', 'Catalog and commercial policy', 'EXCEPTION AUTHORITY'),
      capability('CAP-05', 'Buyer shopping and drafts', 'OVERSIGHT'),
      capability('CAP-06', 'Purchase Requests and Sales Orders', 'EXCEPTION AUTHORITY', 'OVERSIGHT'),
      capability('CAP-07', 'Availability and inventory reservation', 'OVERSIGHT'),
      capability('CAP-08', 'Receiving and warehouse operations', 'EXCEPTION AUTHORITY'),
      capability('CAP-09', 'Fulfillment, dispatch and delivery', 'OVERSIGHT'),
      capability('CAP-10', 'Cold-chain evidence and disposition', 'EXCEPTION AUTHORITY'),
      capability('CAP-11', 'Credit and receivables', 'EXCEPTION AUTHORITY', 'OVERSIGHT'),
      capability('CAP-12', 'Payments and correction', 'EXCEPTION AUTHORITY', 'OVERSIGHT'),
      capability('CAP-13', 'Business documents', 'OVERSIGHT'),
      capability('CAP-14', 'Notifications', 'OVERSIGHT'),
      capability('CAP-15', 'Business traceability', 'OVERSIGHT', 'EXCEPTION AUTHORITY'),
      capability('CAP-16', 'Operational visibility', 'OVERSIGHT'),
    ],
  },
  {
    id: 'tenant-administrator',
    name: 'Tenant Administrator',
    kind: 'workforce',
    apiRoleCode: 'TENANT_ADMIN',
    apiRoleMapping: 'label-only',
    capabilities: [
      capability('CAP-02', 'Workforce access and governance', 'COMMAND', 'OVERSIGHT'),
      capability('CAP-03', 'Customer accounts and buyer relationships', 'QUERY'),
      capability('CAP-04', 'Catalog and commercial policy', 'QUERY'),
      capability('CAP-14', 'Notifications', 'COMMAND', 'OVERSIGHT'),
      capability('CAP-15', 'Business traceability', 'QUERY'),
      capability('CAP-16', 'Operational visibility', 'QUERY'),
    ],
  },
  {
    id: 'business-operations-manager',
    name: 'Business Operations Manager',
    kind: 'workforce',
    apiRoleCode: null,
    apiRoleMapping: 'unavailable',
    capabilities: [
      capability('CAP-02', 'Workforce access and governance', 'QUERY'),
      capability('CAP-03', 'Customer accounts and buyer relationships', 'OVERSIGHT'),
      capability('CAP-04', 'Catalog and commercial policy', 'OVERSIGHT'),
      capability('CAP-05', 'Buyer shopping and drafts', 'QUERY'),
      capability('CAP-06', 'Purchase Requests and Sales Orders', 'OVERSIGHT'),
      capability('CAP-07', 'Availability and inventory reservation', 'OVERSIGHT'),
      capability('CAP-08', 'Receiving and warehouse operations', 'OVERSIGHT'),
      capability('CAP-09', 'Fulfillment, dispatch and delivery', 'OVERSIGHT'),
      capability('CAP-10', 'Cold-chain evidence and disposition', 'OVERSIGHT'),
      capability('CAP-11', 'Credit and receivables', 'OVERSIGHT'),
      capability('CAP-12', 'Payments and correction', 'OVERSIGHT'),
      capability('CAP-13', 'Business documents', 'OVERSIGHT'),
      capability('CAP-14', 'Notifications', 'QUERY'),
      capability('CAP-15', 'Business traceability', 'OVERSIGHT'),
      capability('CAP-16', 'Operational visibility', 'OVERSIGHT'),
    ],
    note: 'The current API role catalog has no Business Operations Manager role.',
  },
  {
    id: 'sales-representative',
    name: 'Sales Representative',
    kind: 'workforce',
    apiRoleCode: 'SALES',
    apiRoleMapping: 'label-only',
    capabilities: [
      capability('CAP-02', 'Workforce access and governance', 'QUERY'),
      capability('CAP-03', 'Customer accounts and buyer relationships', 'COMMAND', 'QUERY'),
      capability('CAP-04', 'Catalog and commercial policy', 'COMMAND', 'QUERY'),
      capability('CAP-05', 'Buyer shopping and drafts', 'COMMAND', 'QUERY'),
      capability('CAP-06', 'Purchase Requests and Sales Orders', 'COMMAND', 'QUERY'),
      capability('CAP-07', 'Availability and inventory reservation', 'QUERY'),
      capability('CAP-09', 'Fulfillment, dispatch and delivery', 'QUERY'),
      capability('CAP-11', 'Credit and receivables', 'QUERY'),
      capability('CAP-12', 'Payments and correction', 'QUERY'),
      capability('CAP-13', 'Business documents', 'QUERY'),
      capability('CAP-14', 'Notifications', 'QUERY'),
      capability('CAP-15', 'Business traceability', 'QUERY'),
      capability('CAP-16', 'Operational visibility', 'QUERY'),
    ],
  },
  {
    id: 'warehouse-operator',
    name: 'Warehouse Operator',
    kind: 'workforce',
    apiRoleCode: 'WAREHOUSE',
    apiRoleMapping: 'label-only',
    capabilities: [
      capability('CAP-02', 'Workforce access and governance', 'QUERY'),
      capability('CAP-03', 'Customer accounts and buyer relationships', 'QUERY'),
      capability('CAP-04', 'Catalog and commercial policy', 'QUERY'),
      capability('CAP-06', 'Purchase Requests and Sales Orders', 'QUERY'),
      capability('CAP-07', 'Availability and inventory reservation', 'COMMAND', 'QUERY'),
      capability('CAP-08', 'Receiving and warehouse operations', 'COMMAND', 'EXCEPTION AUTHORITY'),
      capability('CAP-09', 'Fulfillment, dispatch and delivery', 'COMMAND', 'QUERY'),
      capability('CAP-10', 'Cold-chain evidence and disposition', 'COMMAND', 'EXCEPTION AUTHORITY'),
      capability('CAP-13', 'Business documents', 'QUERY'),
      capability('CAP-14', 'Notifications', 'QUERY'),
      capability('CAP-15', 'Business traceability', 'QUERY'),
      capability('CAP-16', 'Operational visibility', 'QUERY'),
    ],
  },
  {
    id: 'dispatch-coordinator',
    name: 'Dispatch Coordinator',
    kind: 'workforce',
    apiRoleCode: null,
    apiRoleMapping: 'unavailable',
    capabilities: [
      capability('CAP-02', 'Workforce access and governance', 'QUERY'),
      capability('CAP-03', 'Customer accounts and buyer relationships', 'QUERY'),
      capability('CAP-07', 'Availability and inventory reservation', 'QUERY'),
      capability('CAP-08', 'Receiving and warehouse operations', 'QUERY'),
      capability('CAP-09', 'Fulfillment, dispatch and delivery', 'COMMAND', 'EXCEPTION AUTHORITY'),
      capability('CAP-10', 'Cold-chain evidence and disposition', 'COMMAND', 'QUERY'),
      capability('CAP-13', 'Business documents', 'QUERY'),
      capability('CAP-14', 'Notifications', 'QUERY'),
      capability('CAP-15', 'Business traceability', 'QUERY'),
      capability('CAP-16', 'Operational visibility', 'QUERY'),
    ],
    note: 'LOGISTICS is not mapped to Dispatch Coordinator; the API role spans a broader dispatch and delivery permission set.',
  },
  {
    id: 'nexa-commercial-onboarding-staff',
    name: 'Nexa Commercial & Onboarding Staff',
    kind: 'support-boundary',
    apiRoleCode: null,
    apiRoleMapping: 'not-a-workforce-role',
    capabilities: [],
    note: 'Platform support boundary for canonical onboarding stories only; the workforce role-capability matrix does not define this actor.',
  },
];

const API_ROLE_TO_ACTOR: Readonly<Record<string, PlatformActorId>> = {
  COMPANY_OWNER: 'company-owner',
  TENANT_ADMIN: 'tenant-administrator',
  SALES: 'sales-representative',
  WAREHOUSE: 'warehouse-operator',
};

export interface ApiRolePresentation {
  readonly apiRole: string;
  readonly canonicalActorName: string | null;
}

/** Keeps the server role unchanged; any actor label is informational only. */
export function presentApiRoles(roles: readonly string[]): readonly ApiRolePresentation[] {
  return roles.map((apiRole) => {
    const actorId = API_ROLE_TO_ACTOR[apiRole];
    const actor = actorId
      ? CANONICAL_PLATFORM_ACTORS.find((candidate) => candidate.id === actorId)
      : undefined;
    return { apiRole, canonicalActorName: actor?.name ?? null };
  });
}
