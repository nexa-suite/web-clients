import { Routes } from "@angular/router";

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
