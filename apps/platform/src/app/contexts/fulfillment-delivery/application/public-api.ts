import type { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../core/platform-capability.guard";

/** Platform entry point for the order-to-warehouse fulfillment workbench. */
export const PLATFORM_FULFILLMENT_ROUTES: Routes = [
  {
    path: "fulfillment-delivery",
    canActivate: [requirePlatformCapability],
    data: { platformAccessRule: PLATFORM_ACCESS_RULES.fulfillment },
    loadComponent: () =>
      import("../presentation/platform-fulfillment-delivery.component").then(
        (module) => module.PlatformFulfillmentDeliveryComponent,
      ),
    title: "Fulfillment | Nexa Platform",
  },
];

export {
  PlatformWarehouseLifecycleStore,
  type FulfillmentActionName,
  type FulfillmentCommandState,
  type PickingObservationDraft,
  type PickingRow,
  type WarehouseLifecycleState,
} from "./platform-warehouse-lifecycle.store";
export {
  PlatformDispatchPlannerStore,
  type DispatchActionName,
  type DispatchCommandState,
  type DispatchFormDraft,
  type DispatchPlannerState,
} from "./platform-dispatch-planner.store";
export {
  PlatformFulfillmentWorkbenchStore,
  type FulfillmentWorkbenchState,
} from "./platform-fulfillment-workbench.store";
