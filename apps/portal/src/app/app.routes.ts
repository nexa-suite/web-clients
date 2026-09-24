import { Routes } from '@angular/router';
import { requirePortalBuyer } from './features/access/portal-buyer.guard';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./features/access/access.routes').then((module) => module.ACCESS_ROUTES),
  },
  {
    path: '',
    canActivate: [requirePortalBuyer],
    loadComponent: () => import('./shell/portal-shell.component').then((module) => module.PortalShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'catalog' },
      {
        path: 'catalog',
        loadChildren: () => import('./features/catalog/catalog.routes').then((module) => module.CATALOG_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: 'catalog' },
];
