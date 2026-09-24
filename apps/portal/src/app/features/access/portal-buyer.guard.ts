import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PortalSessionStore } from './portal-session.store';

export const requirePortalBuyer: CanActivateFn = async (_route, state) => {
  const session = inject(PortalSessionStore);
  const router = inject(Router);
  const result = await session.initialize();

  if (result === 'authorized') return true;
  if (result === 'relationship-required') return router.createUrlTree(['/access/denied']);
  if (result === 'unavailable') return router.createUrlTree(['/access/unavailable']);
  return router.createUrlTree(['/access'], { queryParams: { returnUrl: state.url } });
};
