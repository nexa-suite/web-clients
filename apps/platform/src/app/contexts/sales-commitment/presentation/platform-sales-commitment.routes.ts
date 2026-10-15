import { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../core/platform-capability.guard";

const orderPage = () =>
  import("./platform-sales-orders-page.component").then(
    (module) => module.PlatformSalesOrdersPageComponent,
  );
export const PLATFORM_SALES_COMMITMENT_ROUTES: Routes = [
  {
    path: "sales/orders",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.salesOrders },
    loadComponent: orderPage,
    title: "Sales orders | Nexa Platform",
  },
  {
    path: "sales/orders/:orderId",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.salesOrders },
    loadComponent: orderPage,
    title: "Sales order | Nexa Platform",
  },
  {
    path: "sales/purchase-requests",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.purchaseRequests },
    loadComponent: () =>
      import("./platform-purchase-request-inbox-page.component").then(
        (module) => module.PlatformPurchaseRequestInboxPageComponent,
      ),
    title: "Purchase request inbox | Nexa Platform",
  },
  {
    path: "sales/purchase-requests/:requestId/changes",
    canActivate: [requirePlatformCapability],
    data: {
      platformAccessRule: PLATFORM_ACCESS_RULES.purchaseRequestMaterialChanges,
    },
    loadComponent: () =>
      import("./platform-purchase-request-material-change-page.component").then(
        (module) => module.PlatformPurchaseRequestMaterialChangePageComponent,
      ),
    title: "Propose material changes | Nexa Platform",
  },
  {
    path: "sales/purchase-requests/:requestId",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.purchaseRequests },
    loadComponent: () =>
      import("./platform-purchase-request-review-page.component").then(
        (module) => module.PlatformPurchaseRequestReviewPageComponent,
      ),
    title: "Review purchase request | Nexa Platform",
  },
];
