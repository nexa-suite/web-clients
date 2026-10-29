export { PLATFORM_ACCESS_ROUTES } from "./access/access.routes";
export {
  PLATFORM_TENANT_GOVERNANCE_ROUTES,
} from "./governance/tenant-access-governance.routes";
export { PlatformActiveContextComponent } from "./access/platform-active-context.component";
export { PlatformShellSessionWrapperComponent } from "./platform-shell-session-wrapper.component";
export {
  requirePlatformAuthentication,
  requirePlatformAuthenticationForChild,
} from "./platform-authentication.guard";

export { PLATFORM_ORGANIZATION_REGISTRATION_ROUTES } from './registration/organization-registration.routes';
