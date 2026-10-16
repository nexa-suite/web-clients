import { InjectionToken } from "@angular/core";
import type { PortalWindow } from "./portal-runtime-config";

export interface PortalDeliveryMapConfiguration {
  readonly tileUrlTemplate: string;
  readonly attribution: string;
  readonly attributionUrl: string | null;
}

/** No external tile requests unless deployment explicitly configures a provider and attribution. */
export const PORTAL_DELIVERY_MAP_CONFIGURATION = new InjectionToken<PortalDeliveryMapConfiguration | null>(
  "PORTAL_DELIVERY_MAP_CONFIGURATION",
  {
    providedIn: "root",
    factory: () => readPortalDeliveryMapConfiguration(),
  },
);

export function readPortalDeliveryMapConfiguration(
  browserWindow: PortalWindow | null = typeof window === "undefined" ? null : (window as PortalWindow),
): PortalDeliveryMapConfiguration | null {
  const configuration = browserWindow?.__NEXA_PORTAL_CONFIG__;
  const tileUrlTemplate = configuration?.deliveryMapTileUrlTemplate?.trim();
  const attribution = configuration?.deliveryMapAttribution?.trim();
  if (!tileUrlTemplate || !attribution || attribution.length > 200 || /[\u0000-\u001f\u007f]/.test(attribution)) return null;
  if (!isValidTileTemplate(tileUrlTemplate, browserWindow)) return null;

  const attributionUrl = configuration?.deliveryMapAttributionUrl?.trim();
  if (!attributionUrl) return { tileUrlTemplate, attribution, attributionUrl: null };
  const safeAttributionUrl = validatedUrl(attributionUrl, browserWindow);
  return safeAttributionUrl ? { tileUrlTemplate, attribution, attributionUrl: safeAttributionUrl } : null;
}

function isValidTileTemplate(template: string, browserWindow: PortalWindow | null): boolean {
  if (["{z}", "{x}", "{y}"].some((key) => template.split(key).length !== 2)) return false;
  if (/\s|[{}]/.test(template.replace("{z}", "").replace("{x}", "").replace("{y}", ""))) return false;
  const rendered = template.replace("{z}", "15").replace("{x}", "1").replace("{y}", "1");
  const url = validatedUrl(rendered, browserWindow);
  return url !== null && !new URL(url).search && !new URL(url).hash;
}

function validatedUrl(value: string, browserWindow: PortalWindow | null): string | null {
  try {
    if (value.startsWith("//")) return null;
    const origin = browserWindow?.location?.origin || "https://portal.invalid";
    const base = new URL(origin);
    const url = new URL(value, base);
    if (url.username || url.password || url.hash) return null;
    const loopback = isLoopback(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
    if (url.protocol === "http:" && !loopback) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "127.0.0.1" || normalized === "::1";
}
