import { Routes } from "@angular/router";
import { PORTAL_ACCESS_RULES } from "../../../core/portal-access-policy";
import { requirePortalCapability } from "../../../core/portal-capability.guard";

export const PORTAL_SALES_COMMITMENT_ROUTES: Routes = [
  {
    path: "requests/new",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.purchaseRequestDraft },
    loadComponent: () => import("./buyer-purchase-request-draft-page.component").then((module) => module.BuyerPurchaseRequestDraftPageComponent),
    title: "Build purchase request | Nexa Buyer Portal",
  },
  {
    path: "requests",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.purchaseRequests },
    loadComponent: () => import("./buyer-purchase-requests-page.component").then((module) => module.BuyerPurchaseRequestsPageComponent),
    title: "My requests | Nexa Buyer Portal",
  },
  {
    path: "requests/:requestId",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.purchaseRequests },
    loadComponent: () => import("./buyer-purchase-request-detail-page.component").then((module) => module.BuyerPurchaseRequestDetailPageComponent),
    title: "Purchase request | Nexa Buyer Portal",
  },
  {
    path: "orders",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.orders },
    loadComponent: () => import("./buyer-sales-orders-page.component").then((module) => module.BuyerSalesOrdersPageComponent),
    title: "My orders | Nexa Buyer Portal",
  },
  {
    path: "orders/:orderId",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.orders },
    loadComponent: () => import("./buyer-sales-order-detail-page.component").then((module) => module.BuyerSalesOrderDetailPageComponent),
    title: "Sales order | Nexa Buyer Portal",
  },
];
