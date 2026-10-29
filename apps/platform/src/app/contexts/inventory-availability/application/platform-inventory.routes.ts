import type { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../core/platform-capability.guard";

export const PLATFORM_INVENTORY_ROUTES: Routes = [
  {
    path: "inventory",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.inventory },
    loadComponent: () =>
      import("../presentation/platform-inventory-page.component").then(
        (module) => module.PlatformInventoryPageComponent,
      ),
    title: "Inventory | Nexa Platform",
  },
];
