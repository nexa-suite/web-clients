import { Routes } from '@angular/router';
import { requirePlatformAuthentication, requirePlatformAuthenticationForChild } from '../../core/platform-authentication.guard';
import { PlatformShellSessionWrapperComponent } from '../../core/platform-shell-session-wrapper.component';
import { PlatformActiveContextComponent } from './platform-active-context.component';
import { SignInPageComponent } from './sign-in-page.component';

export const accessRoutes: Routes = [
  {
    path: 'sign-in',
    component: SignInPageComponent,
    title: 'Sign in | Nexa Platform',
  },
  {
    path: '',
    canActivate: [requirePlatformAuthentication],
    canActivateChild: [requirePlatformAuthenticationForChild],
    component: PlatformShellSessionWrapperComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: PlatformActiveContextComponent,
        title: 'Active context | Nexa Platform',
      },
    ],
  },
];
