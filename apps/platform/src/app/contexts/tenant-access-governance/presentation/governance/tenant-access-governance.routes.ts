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
];
