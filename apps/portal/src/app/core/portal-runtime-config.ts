import { normalizeNexaApiBaseUrl } from '@nexa/api';

export const DEFAULT_PORTAL_API_BASE_URL = "/api/v1";

export interface PortalRuntimeConfiguration {
  readonly apiBaseUrl: string;
}

export interface PortalWindow extends Window {
  __NEXA_PORTAL_CONFIG__?: {
    readonly apiBaseUrl?: string;
  };
}

/** Reads deployment-provided configuration before Angular providers are created. */
export function readPortalRuntimeConfiguration(
  browserWindow: PortalWindow | null = typeof window === "undefined"
    ? null
    : (window as PortalWindow),
): PortalRuntimeConfiguration {
  const configuredUrl = browserWindow?.__NEXA_PORTAL_CONFIG__?.apiBaseUrl;
  const apiBaseUrl =
    typeof configuredUrl === "string" && configuredUrl.trim()
      ? normalizeNexaApiBaseUrl(configuredUrl)
      : DEFAULT_PORTAL_API_BASE_URL;

  return { apiBaseUrl };
}
