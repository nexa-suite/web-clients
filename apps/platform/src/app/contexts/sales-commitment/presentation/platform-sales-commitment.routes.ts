import { Routes } from "@angular/router";

export const PLATFORM_SALES_COMMITMENT_ROUTES: Routes = [
  {
    path: "sales/purchase-requests",
    loadComponent: () => import("./platform-purchase-request-inbox-page.component").then((module) => module.PlatformPurchaseRequestInboxPageComponent),
    title: "Purchase request inbox | Nexa Platform",
  },
  {
    path: "sales/purchase-requests/:requestId",
    loadComponent: () => import("./platform-purchase-request-review-page.component").then((module) => module.PlatformPurchaseRequestReviewPageComponent),
    title: "Review purchase request | Nexa Platform",
  },
];
