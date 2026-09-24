import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { PlatformSessionStore } from './platform-session.store';

export const requirePlatformAuthentication: CanActivateFn = (_route, routeState) => {
  const sessions = inject(PlatformSessionStore);
  const router = inject(Router);

  return sessions.restoreSession().pipe(
    map((state) => state.status === 'authenticated'
      ? true
      : router.createUrlTree(['/sign-in'], { queryParams: { returnUrl: routeState.url } })),
  );
};

export const requirePlatformAuthenticationForChild: CanActivateChildFn = (_route, routeState) => {
  const sessions = inject(PlatformSessionStore);
  const router = inject(Router);

  return sessions.restoreSession().pipe(
    map((state) => state.status === 'authenticated'
      ? true
      : router.createUrlTree(['/sign-in'], { queryParams: { returnUrl: routeState.url } })),
  );
};
