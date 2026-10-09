import type { Routes } from "@angular/router";

/** Platform entry point for the order-to-warehouse fulfillment workbench. */
export const PLATFORM_FULFILLMENT_ROUTES: Routes = [
  {
    path: "fulfillment-delivery",
    loadComponent: () =>
      import("../presentation/platform-fulfillment-delivery.component").then(
        (module) => module.PlatformFulfillmentDeliveryComponent,
      ),
    title: "Fulfillment | Nexa Platform",
  },
];
