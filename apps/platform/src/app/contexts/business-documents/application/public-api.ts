import type { Routes } from "@angular/router";

/** Platform entry point for the authorized business document workbench. */
export const PLATFORM_BUSINESS_DOCUMENT_ROUTES: Routes = [
  {
    path: "documents",
    children: [
      {
        path: "",
        loadComponent: () =>
          import("../presentation/platform-business-documents-page.component").then(
            (module) => module.PlatformBusinessDocumentsPageComponent,
          ),
        title: "Business documents | Nexa Platform",
      },
      {
        path: ":documentId",
        loadComponent: () =>
          import("../presentation/platform-business-document-detail-page.component").then(
            (module) => module.PlatformBusinessDocumentDetailPageComponent,
          ),
        title: "Business document | Nexa Platform",
      },
    ],
  },
];
