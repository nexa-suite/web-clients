import { inject } from "@angular/core";
import { CanActivateChildFn, CanActivateFn, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import {
  PortalBuyerEligibilityService,
  type PortalBuyerEligibilityResult,
} from "../application/public-api";

export const requirePortalBuyer: CanActivateFn = async (_route, state) => {
  return checkPortalBuyer(state.url);
};

export const requirePortalBuyerChild: CanActivateChildFn = async (
  _route,
  state,
) => {
  return checkPortalBuyer(state.url);
};

async function checkPortalBuyer(returnUrl: string) {
  const sessions = inject(PortalSessionStore);
  const eligibility = inject(PortalBuyerEligibilityService);
  const router = inject(Router);
  const session = await firstValueFrom(sessions.restoreSession());
  if (session.status === "error") {
    const result = await firstValueFrom(eligibility.checkCurrent());
    return routeForBuyerResult(result, returnUrl, router);
  }
  if (session.status !== "authenticated")
    return router.createUrlTree(["/access"], { queryParams: { returnUrl } });

  const result = await firstValueFrom(eligibility.checkCurrent());
  return routeForBuyerResult(result, returnUrl, router);
}

function routeForBuyerResult(
  result: PortalBuyerEligibilityResult,
  returnUrl: string,
  router: Router,
) {
  if (result === "authorized") return true;
  if (result === "relationship-required")
    return router.createUrlTree(["/access/denied"]);
  if (result === "unavailable")
    return router.createUrlTree(["/access/unavailable"]);
  return router.createUrlTree(["/access"], { queryParams: { returnUrl } });
}
