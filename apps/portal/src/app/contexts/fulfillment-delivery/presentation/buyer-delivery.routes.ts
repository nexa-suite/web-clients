import type { Routes } from "@angular/router";
export const PORTAL_DELIVERY_ROUTES: Routes = [
  { path: "", loadComponent: () => import("./buyer-deliveries-page.component").then(module => module.BuyerDeliveriesPageComponent) },
  { path: ":id", loadComponent: () => import("./buyer-delivery-detail-page.component").then(module => module.BuyerDeliveryDetailPageComponent) },
];
