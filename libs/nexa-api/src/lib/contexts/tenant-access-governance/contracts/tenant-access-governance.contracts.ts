export const NEXA_TENANT_ACCESS_API_PATHS = {
  organization: "/organization/current",
  workspaces: "/workspaces",
  memberships: "/workspace-memberships",
  invitations: "/organization-invitations",
  roles: "/roles",
  permissionCatalog: "/permissions/catalog",
} as const;

export type InternalMembershipRole =
  | "TENANT_ADMIN"
  | "COMPANY_OWNER"
  | "SALES"
  | "WAREHOUSE"
  | "LOGISTICS"
  | "BUSINESS_OPERATIONS_MANAGER";

export type WorkspaceMembershipType = "INTERNAL" | "BUYER" | "SYSTEM_WORKFLOW";

export interface OrganizationSummaryResponse {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly currentWorkspaceId: string;
  readonly currentWorkspaceName: string;
  readonly version: number;
}

export interface WorkspaceSummaryResponse {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly version: number;
}

export interface WorkspaceMembershipResponse {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly membershipType: WorkspaceMembershipType;
  readonly email: string;
  readonly displayName: string;
  readonly status: string;
  readonly version: number;
  readonly roles: readonly string[];
  readonly roleDefinitionIds: readonly string[];
  readonly permissionCodes: readonly string[];
}

export interface InvitationResponse {
  readonly id: string;
  readonly workspaceId: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly status: string;
  readonly expiresAt: string;
  readonly version: number;
  readonly createdAt: string;
}

export interface InvitationPageResponse {
  readonly items: readonly InvitationResponse[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNext: boolean;
}

export interface CreateInvitationRequest {
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly InternalMembershipRole[];
}

export interface RoleDefinitionResponse {
  readonly id: string;
  readonly tenantId: string | null;
  readonly workspaceId: string | null;
  readonly type: "SYSTEM_RESERVED" | "SYSTEM_TEMPLATE" | "CUSTOM";
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
  readonly status: "ACTIVE" | "INACTIVE";
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface PermissionCatalogEntryResponse {
  readonly code: string;
  readonly group: string;
  readonly legacyCodes: readonly string[];
}

export interface CreateRoleDefinitionRequest {
  readonly workspaceId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

export interface UpdateRoleDefinitionRequest {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}
