import { Routes } from "@angular/router";
import {
  PlatformActiveContextComponent,
  PlatformShellSessionWrapperComponent,
  PLATFORM_ACCESS_ROUTES,
  PLATFORM_INTERNAL_CONSOLE_ROUTES,
  PLATFORM_TENANT_GOVERNANCE_ROUTES,
  requirePlatformAuthentication,
  requirePlatformAuthenticationForChild,
} from "./contexts/tenant-access-governance/presentation/public-api";
import { PLATFORM_FULFILLMENT_ROUTES } from "./contexts/fulfillment-delivery/application/public-api";
import { PLATFORM_SALES_COMMITMENT_ROUTES } from "./contexts/sales-commitment/application/public-api";

import { PLATFORM_BUSINESS_DOCUMENT_ROUTES } from "./contexts/business-documents/application/public-api";
import { PLATFORM_CREDIT_CONFIGURATION_ROUTES } from "./contexts/credit-receivables/application/public-api";

export const routes: Routes = [
  ...PLATFORM_ACCESS_ROUTES,
  ...PLATFORM_INTERNAL_CONSOLE_ROUTES,
  {
    path: "",
    canActivate: [requirePlatformAuthentication],
    canActivateChild: [requirePlatformAuthenticationForChild],
    component: PlatformShellSessionWrapperComponent,
    children: [
      ...PLATFORM_TENANT_GOVERNANCE_ROUTES,
      {
        path: "",
        pathMatch: "full",
        component: PlatformActiveContextComponent,
        title: "Active context | Nexa Platform",
      },
      {
        path: "operations/overview",
        loadComponent: () =>
          import("./features/operations/operations-overview.component").then(
            (module) => module.PlatformOperationsOverviewComponent,
          ),
        title: "Operations overview | Nexa Platform",
      },
      ...PLATFORM_SALES_COMMITMENT_ROUTES,
      ...PLATFORM_FULFILLMENT_ROUTES,
      ...PLATFORM_BUSINESS_DOCUMENT_ROUTES,
      ...PLATFORM_CREDIT_CONFIGURATION_ROUTES,
    ],
  },
  { path: "**", redirectTo: "" },
];
