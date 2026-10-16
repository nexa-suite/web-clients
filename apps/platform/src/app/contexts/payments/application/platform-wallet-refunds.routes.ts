import type { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../core/platform-capability.guard";

export const PLATFORM_WALLET_REFUND_ROUTES: Routes = [
  {
    path: "wallet-refunds",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.walletRefunds },
    loadComponent: () =>
      import("../presentation/platform-wallet-refunds-page.component").then(
        (module) => module.PlatformWalletRefundsPageComponent,
      ),
    title: "Wallet refunds | Nexa Platform",
  },
];
