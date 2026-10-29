import type { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../core/platform-capability.guard";
export const PLATFORM_CLIENT_ROUTES: Routes = [
  {
    path: "clients",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.clients },
    loadComponent: () =>
      import("../presentation/platform-clients-page.component").then(
        (module) => module.PlatformClientsPageComponent,
      ),
    title: "Client accounts | Nexa Platform",
  },
];
