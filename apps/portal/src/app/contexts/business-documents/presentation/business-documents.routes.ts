import type { Routes } from "@angular/router";
import { BusinessDocumentDetailPageComponent } from "./business-document-detail-page.component";
import { BusinessDocumentsPageComponent } from "./business-documents-page.component";

export const PORTAL_BUSINESS_DOCUMENT_ROUTES: Routes = [
  {
    path: "",
    component: BusinessDocumentsPageComponent,
    title: "Business documents | Nexa Buyer Portal",
  },
  {
    path: ":documentId",
    component: BusinessDocumentDetailPageComponent,
    title: "Business document | Nexa Buyer Portal",
  },
];
