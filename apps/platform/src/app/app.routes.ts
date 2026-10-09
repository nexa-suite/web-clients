import { Routes } from '@angular/router';
import { accessRoutes } from './contexts/tenant-access-governance/presentation/access/access.routes';

export const routes: Routes = [
  ...accessRoutes,
  { path: '**', redirectTo: '' },
];
