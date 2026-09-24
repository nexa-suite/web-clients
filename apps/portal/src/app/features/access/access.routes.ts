import { Routes } from '@angular/router';
import { AccessPageComponent } from './access-page.component';
import { AccessStatusPageComponent } from './access-status-page.component';

export const ACCESS_ROUTES: Routes = [
  { path: 'access', component: AccessPageComponent },
  { path: 'access/denied', component: AccessStatusPageComponent },
  { path: 'access/unavailable', component: AccessStatusPageComponent },
];
