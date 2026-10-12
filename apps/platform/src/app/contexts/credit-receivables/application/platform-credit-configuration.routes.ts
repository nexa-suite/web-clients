import type { Routes } from "@angular/router";

export const PLATFORM_CREDIT_CONFIGURATION_ROUTES: Routes = [
  {
    path: "credit-configuration",
    loadComponent: () =>
      import("../presentation/platform-credit-configuration-page.component").then(
        (module) => module.PlatformCreditConfigurationPageComponent,
      ),
    title: "Client credit configuration | Nexa Platform",
  },
];
