import { normalizeNexaApiBaseUrl } from "@nexa/api";

export const DEFAULT_PLATFORM_API_BASE_URL = "/api/v1";

export interface PlatformRuntimeConfiguration {
  readonly apiBaseUrl: string;
}

export interface PlatformWindow extends Window {
  __NEXA_PLATFORM_CONFIG__?: {
    readonly apiBaseUrl?: string;
  };
}

/** Reads deployment-provided configuration before Angular providers are created. */
export function readPlatformRuntimeConfiguration(
  browserWindow: PlatformWindow | null = typeof window === "undefined"
    ? null
    : (window as PlatformWindow),
): PlatformRuntimeConfiguration {
  const configuredUrl = browserWindow?.__NEXA_PLATFORM_CONFIG__?.apiBaseUrl;
  const apiBaseUrl =
    typeof configuredUrl === "string" && configuredUrl.trim()
      ? normalizeNexaApiBaseUrl(configuredUrl)
      : DEFAULT_PLATFORM_API_BASE_URL;

  return { apiBaseUrl };
}
