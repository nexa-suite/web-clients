import { Routes } from '@angular/router';
import { ACCESS_ROUTES } from './features/access/access.routes';
import { CATALOG_ROUTES } from './features/catalog/catalog.routes';
import { requirePortalBuyer } from './features/access/portal-buyer.guard';
import { PortalShellComponent } from './shell/portal-shell.component';

export const routes: Routes = [
  ...ACCESS_ROUTES,
  {
    path: 'catalog',
    component: PortalShellComponent,
    canActivate: [requirePortalBuyer],
    children: CATALOG_ROUTES,
  },
  { path: '', pathMatch: 'full', redirectTo: 'access' },
];
