import { Routes } from "@angular/router";

export const PORTAL_SALES_COMMITMENT_ROUTES: Routes = [
  {
    path: "requests/new",
    loadComponent: () => import("./buyer-purchase-request-draft-page.component").then((module) => module.BuyerPurchaseRequestDraftPageComponent),
    title: "Build purchase request | Nexa Buyer Portal",
  },
  {
    path: "requests",
    loadComponent: () => import("./buyer-purchase-requests-page.component").then((module) => module.BuyerPurchaseRequestsPageComponent),
    title: "My requests | Nexa Buyer Portal",
  },
  {
    path: "requests/:requestId",
    loadComponent: () => import("./buyer-purchase-request-detail-page.component").then((module) => module.BuyerPurchaseRequestDetailPageComponent),
    title: "Purchase request | Nexa Buyer Portal",
  },
  {
    path: "orders",
    loadComponent: () => import("./buyer-sales-orders-page.component").then((module) => module.BuyerSalesOrdersPageComponent),
    title: "My orders | Nexa Buyer Portal",
  },
  {
    path: "orders/:orderId",
    loadComponent: () => import("./buyer-sales-order-detail-page.component").then((module) => module.BuyerSalesOrderDetailPageComponent),
    title: "Sales order | Nexa Buyer Portal",
  },
];
