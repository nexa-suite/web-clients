import type { Routes } from "@angular/router";
import { PORTAL_ACCESS_RULES } from "../../../core/portal-access-policy";
import { requirePortalCapability } from "../../../core/portal-capability.guard";
export const PORTAL_DELIVERY_ROUTES: Routes = [
  {
    path: "",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.deliveries },
    loadComponent: () => import("./buyer-deliveries-page.component").then(module => module.BuyerDeliveriesPageComponent),
  },
  {
    path: ":id",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.deliveries },
    loadComponent: () => import("./buyer-delivery-detail-page.component").then(module => module.BuyerDeliveryDetailPageComponent),
  },
];
