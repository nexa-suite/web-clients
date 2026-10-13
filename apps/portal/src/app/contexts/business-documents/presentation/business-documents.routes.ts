import type { Routes } from "@angular/router";
import { PORTAL_ACCESS_RULES } from "../../../core/portal-access-policy";
import { requirePortalCapability } from "../../../core/portal-capability.guard";
import { BusinessDocumentDetailPageComponent } from "./business-document-detail-page.component";
import { BusinessDocumentsPageComponent } from "./business-documents-page.component";

export const PORTAL_BUSINESS_DOCUMENT_ROUTES: Routes = [
  {
    path: "",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.documents },
    component: BusinessDocumentsPageComponent,
    title: "Business documents | Nexa Buyer Portal",
  },
  {
    path: ":documentId",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.documents },
    component: BusinessDocumentDetailPageComponent,
    title: "Business document | Nexa Buyer Portal",
  },
];
