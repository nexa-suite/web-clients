import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { PlatformSessionStore } from "../contexts/tenant-access-governance/application/public-api";
import {
  canAccessPlatformFeature,
  type PlatformAccessRule,
} from "./platform-access-policy";

/** Route-level capability hint, evaluated against the active API session. */
export const requirePlatformCapability: CanActivateFn = (route) => {
  const sessions = inject(PlatformSessionStore);
  const router = inject(Router);
  const rule = route.data["platformAccessRule"] as
    | PlatformAccessRule
    | undefined;
  const current = sessions.state();

  return rule && current.status === "authenticated" &&
    canAccessPlatformFeature(current.session, rule)
    ? true
    : router.createUrlTree(["/"]);
};
