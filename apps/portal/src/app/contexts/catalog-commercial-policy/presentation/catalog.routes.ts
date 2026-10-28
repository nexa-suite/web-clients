import { Routes } from "@angular/router";
import { PORTAL_ACCESS_RULES } from "../../../core/portal-access-policy";
import { requirePortalCapability } from "../../../core/portal-capability.guard";
import { CatalogDetailPageComponent } from "./catalog-detail-page.component";
import { BuyerCatalogFavoritesPageComponent } from "./buyer-catalog-favorites-page.component";
import { CatalogPageComponent } from "./catalog-page.component";

export const PORTAL_CATALOG_ROUTES: Routes = [
  {
    path: "favorites",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.catalogFavoritesRead },
    component: BuyerCatalogFavoritesPageComponent,
    title: "Saved products | Nexa Buyer Portal",
  },
  {
    path: "",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.catalog },
    component: CatalogPageComponent,
    title: "Catalog | Nexa Buyer Portal",
  },
  {
    path: ":catalogItemId",
    canActivate: [requirePortalCapability],
    data: { portalAccessRule: PORTAL_ACCESS_RULES.catalog },
    component: CatalogDetailPageComponent,
    title: "SKU details | Nexa Buyer Portal",
  },
];
