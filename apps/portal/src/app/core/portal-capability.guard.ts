import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { PortalSessionStore } from "../contexts/tenant-access-governance/application/public-api";
import {
  canAccessPortalFeature,
  type PortalAccessRule,
} from "./portal-access-policy";

/** Route-level capability hint, evaluated against the active API session. */
export const requirePortalCapability: CanActivateFn = (route) => {
  const sessions = inject(PortalSessionStore);
  const router = inject(Router);
  const rule = route.data["portalAccessRule"] as PortalAccessRule | undefined;

  return rule && canAccessPortalFeature(sessions.session(), rule)
    ? true
    : router.createUrlTree(["/access/denied"]);
};
