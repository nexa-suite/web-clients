import { Routes } from "@angular/router";

/** Internal support workflow uses its own operator credential, outside tenant sessions. */
export const PLATFORM_INTERNAL_CONSOLE_ROUTES: Routes = [
  {
    path: "internal-console",
    loadComponent: () =>
      import("./internal-console/internal-console-page.component").then(
        (module) => module.InternalConsolePageComponent,
      ),
    title: "Internal console | Nexa",
  },
];

/** Protected routes mounted inside the authenticated Platform shell. */
export const PLATFORM_TENANT_GOVERNANCE_ROUTES: Routes = [
  {
    path: "organization/access",
    loadComponent: () =>
      import("./platform-tenant-memberships-page.component").then(
        (module) => module.PlatformTenantMembershipsPageComponent,
      ),
    title: "Workforce access | Nexa Platform",
  },
  {
    path: "organization/roles",
    loadComponent: () =>
      import("./platform-tenant-roles-page.component").then(
        (module) => module.PlatformTenantRolesPageComponent,
      ),
    title: "Roles and permissions | Nexa Platform",
  },
  {
    path: "organization/support-consents",
    loadComponent: () =>
      import("./platform-company-owner-support-consents.component").then(
        (module) => module.PlatformCompanyOwnerSupportConsentsComponent,
      ),
    title: "Temporary support consent | Nexa Platform",
  },
  {
    path: "organization/warehouse-access",
    loadComponent: () =>
      import("./platform-warehouse-access-grants.component").then(
        (module) => module.PlatformWarehouseAccessGrantsComponent,
      ),
    title: "Warehouse access grants | Nexa Platform",
  },
];
