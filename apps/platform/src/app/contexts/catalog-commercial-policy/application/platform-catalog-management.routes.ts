import type { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../core/platform-capability.guard";

export const PLATFORM_CATALOG_MANAGEMENT_ROUTES: Routes = [
  {
    path: "catalog/manage",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.catalogManagement },
    loadComponent: () =>
      import("../presentation/platform-catalog-management-page.component").then(
        (module) => module.PlatformCatalogManagementPageComponent,
      ),
    title: "Catalog management | Nexa Platform",
  },
];
