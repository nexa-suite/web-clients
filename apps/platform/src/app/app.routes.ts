import { Routes } from '@angular/router';
import { accessRoutes } from './features/access/access.routes';

export const routes: Routes = [
  ...accessRoutes,
  { path: '**', redirectTo: '' },
];
