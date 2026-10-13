import type { Routes } from "@angular/router";
import { PLATFORM_ACCESS_RULES } from "../../../core/platform-access-policy";
import { requirePlatformCapability } from "../../../core/platform-capability.guard";

/** Platform entry point for the authorized business document workbench. */
export const PLATFORM_BUSINESS_DOCUMENT_ROUTES: Routes = [
  {
    path: "documents",
    children: [
      {
        path: "",
        canActivate: [requirePlatformCapability],
        data: { platformAccessRule: PLATFORM_ACCESS_RULES.documents },
        loadComponent: () =>
          import("../presentation/platform-business-documents-page.component").then(
            (module) => module.PlatformBusinessDocumentsPageComponent,
          ),
        title: "Business documents | Nexa Platform",
      },
      {
        path: "order-summary",
        canActivate: [requirePlatformCapability],
        data: { platformAccessRule: PLATFORM_ACCESS_RULES.orderSummaryGeneration },
        loadComponent: () =>
          import("../presentation/platform-order-summary-candidates-page.component").then(
            (module) => module.PlatformOrderSummaryCandidatesPageComponent,
          ),
        title: "Request order summary | Nexa Platform",
      },
      {
        path: "order-summary/:salesOrderId",
        canActivate: [requirePlatformCapability],
        data: { platformAccessRule: PLATFORM_ACCESS_RULES.orderSummaryGeneration },
        loadComponent: () =>
          import("../presentation/platform-order-summary-generation-page.component").then(
            (module) => module.PlatformOrderSummaryGenerationPageComponent,
          ),
        title: "Request order summary | Nexa Platform",
      },
      {
        path: ":documentId",
        canActivate: [requirePlatformCapability],
        data: { platformAccessRule: PLATFORM_ACCESS_RULES.documents },
        loadComponent: () =>
          import("../presentation/platform-business-document-detail-page.component").then(
            (module) => module.PlatformBusinessDocumentDetailPageComponent,
          ),
        title: "Business document | Nexa Platform",
      },
    ],
  },
];
