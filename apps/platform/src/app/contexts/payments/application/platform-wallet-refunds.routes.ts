import type { Routes } from "@angular/router";

export const PLATFORM_WALLET_REFUND_ROUTES: Routes = [
  {
    path: "wallet-refunds",
    loadComponent: () =>
      import("../presentation/platform-wallet-refunds-page.component").then(
        (module) => module.PlatformWalletRefundsPageComponent,
      ),
    title: "Wallet refunds | Nexa Platform",
  },
];
