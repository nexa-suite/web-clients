import { Routes } from "@angular/router";
import {
  requirePortalBuyer,
  requirePortalBuyerChild,
} from "./contexts/customer-buyer-relationships/presentation/public-api";
import { PORTAL_ACCESS_ROUTES } from "./contexts/tenant-access-governance/presentation/public-api";

export const routes: Routes = [
  {
    path: "",
    children: PORTAL_ACCESS_ROUTES,
  },
  {
    path: "",
    canActivate: [requirePortalBuyer],
    canActivateChild: [requirePortalBuyerChild],
    loadComponent: () =>
      import("./shell/portal-shell.component").then(
        (module) => module.PortalShellComponent,
      ),
    children: [
      {
        path: "deliveries",
        loadChildren: () => import("./contexts/fulfillment-delivery/application/public-api").then(module => module.PORTAL_DELIVERY_ROUTES),
      },
      {
        path: "documents",
        loadChildren: () =>
          import("./contexts/business-documents/application/public-api").then(
            (module) => module.PORTAL_BUSINESS_DOCUMENT_ROUTES,
          ),
      },
      {
        path: "",
        loadChildren: () =>
          import("./contexts/sales-commitment/application/public-api").then(
            (module) => module.PORTAL_SALES_COMMITMENT_ROUTES,
          ),
      },
      {
        path: "wallet",
        loadComponent: () =>
          import("./compositions/wallet/buyer-wallet-page.component").then(
            (module) => module.BuyerWalletPageComponent,
          ),
      },
      { path: "", pathMatch: "full", redirectTo: "catalog" },
      {
        path: "catalog",
        loadChildren: () =>
          import("./contexts/catalog-commercial-policy/application/public-api").then(
            (module) => module.PORTAL_CATALOG_ROUTES,
          ),
      },
    ],
  },
  { path: "**", redirectTo: "catalog" },
];
