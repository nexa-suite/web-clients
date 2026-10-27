import { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../../core/platform-capability.guard";

/** Protected routes mounted inside the authenticated Platform shell. */
export const PLATFORM_TENANT_GOVERNANCE_ROUTES: Routes = [
  {
    path: "organization/access",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.workforceAccess },
    loadComponent: () =>
      import("./platform-tenant-memberships-page.component").then(
        (module) => module.PlatformTenantMembershipsPageComponent,
      ),
    title: "Workforce access | Nexa Platform",
  },
  {
    path: "organization/roles",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.rolesAndPermissions },
    loadComponent: () =>
      import("./platform-tenant-roles-page.component").then(
        (module) => module.PlatformTenantRolesPageComponent,
      ),
    title: "Roles and permissions | Nexa Platform",
  },
  {
    path: "organization/support-consents",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.supportConsent },
    loadComponent: () =>
      import("./platform-company-owner-support-consents.component").then(
        (module) => module.PlatformCompanyOwnerSupportConsentsComponent,
      ),
    title: "Temporary support consent | Nexa Platform",
  },
  {
    path: "organization/warehouse-access",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.warehouseAccess },
    loadComponent: () =>
      import("./platform-warehouse-access-grants.component").then(
        (module) => module.PlatformWarehouseAccessGrantsComponent,
      ),
    title: "Warehouse access grants | Nexa Platform",
  },
];
