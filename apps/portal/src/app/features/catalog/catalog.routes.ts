import { Routes } from '@angular/router';
import { CatalogDetailPageComponent } from './catalog-detail-page.component';
import { CatalogPageComponent } from './catalog-page.component';

export const CATALOG_ROUTES: Routes = [
  { path: '', component: CatalogPageComponent, title: 'Catalog | Nexa Buyer Portal' },
  { path: ':catalogItemId', component: CatalogDetailPageComponent, title: 'SKU details | Nexa Buyer Portal' },
];
