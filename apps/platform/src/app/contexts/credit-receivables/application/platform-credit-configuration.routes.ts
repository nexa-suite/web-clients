import type { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../core/platform-capability.guard";

export const PLATFORM_CREDIT_CONFIGURATION_ROUTES: Routes = [
  {
    path: "credit-configuration",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.creditConfiguration },
    loadComponent: () =>
      import("../presentation/platform-credit-configuration-page.component").then(
        (module) => module.PlatformCreditConfigurationPageComponent,
      ),
    title: "Client credit configuration | Nexa Platform",
  },
];
