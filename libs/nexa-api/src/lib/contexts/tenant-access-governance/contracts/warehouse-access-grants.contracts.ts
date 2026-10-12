export const NEXA_WAREHOUSE_ACCESS_API_PATHS = {
  warehouses: "/warehouses",
} as const;

export interface WarehousePageResponse {
  readonly items: readonly WarehouseResponse[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface WarehouseResponse {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly version: number;
}

export interface WarehouseAccessGrantResponse {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly membershipId: string;
  readonly warehouseId: string;
  readonly status: "ACTIVE" | "REVOKED";
  readonly version: number;
  readonly changedByMembershipId: string;
  readonly changedAt: string;
}

export interface GrantWarehouseAccessRequest {
  readonly membershipId: string;
}
