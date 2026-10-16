import type { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../core/platform-capability.guard";
export const PLATFORM_CATALOG_ROUTES: Routes = [
  {
    path: "catalog",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.catalog },
    loadComponent: () =>
      import("../presentation/platform-catalog-page.component").then(
        (module) => module.PlatformCatalogPageComponent,
      ),
    title: "Catalog | Nexa Platform",
  },
];
