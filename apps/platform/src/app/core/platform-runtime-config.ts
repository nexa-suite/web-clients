export const DEFAULT_PLATFORM_API_BASE_URL = '/api/v1';
const PLATFORM_API_BASE_PATH = '/api/v1';
const PLATFORM_ORIGIN = 'https://platform.invalid';

export interface PlatformRuntimeConfiguration {
  readonly apiBaseUrl: string;
}

export interface PlatformWindow extends Window {
  __NEXA_PLATFORM_CONFIG__?: {
    readonly apiBaseUrl?: string;
  };
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    const relative = new URL(trimmed, PLATFORM_ORIGIN);
    if (relative.origin !== PLATFORM_ORIGIN || relative.search || relative.hash
      || normalizePath(relative.pathname) !== PLATFORM_API_BASE_PATH) {
      throw new Error('Platform API base URL must use the /api/v1 path without a query or fragment.');
    }
    return PLATFORM_API_BASE_PATH;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Platform API base URL must be an absolute HTTP(S) URL or a root-relative path.');
  }

  const separatorIndex = trimmed.indexOf('://');
  const scheme = trimmed.slice(0, separatorIndex);
  if (separatorIndex < 1 || (scheme !== 'http' && scheme !== 'https')) {
    throw new Error('Platform API base URL must use a lowercase HTTP(S) scheme.');
  }
  const authority = trimmed.slice(separatorIndex + 3).split('/')[0];
  const rawHost = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.replace(/:\d+$/, '');
  if (!/^(?:[A-Za-z0-9][A-Za-z0-9.-]*|\[::1\])$/.test(rawHost)) {
    throw new Error('Platform API base URL must use a supported DNS, IPv4, or loopback IPv6 host.');
  }
  if (/^[0-9.]+$/.test(rawHost)) {
    const octets = rawHost.split('.');
    if (octets.length !== 4 || octets.some((octet) => !/^\d+$/.test(octet) || Number(octet) > 255)) {
      throw new Error('Platform API IPv4 origins must use four octets between 0 and 255.');
    }
  }
  const port = authority.match(/:(\d+)$/)?.[1];
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    throw new Error('Platform API port must be between 1 and 65535.');
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.username || parsed.password || parsed.search || parsed.hash
    || normalizePath(parsed.pathname) !== PLATFORM_API_BASE_PATH) {
    throw new Error('Platform API base URL must use HTTP(S), the /api/v1 path, and no credentials, query, or fragment.');
  }

  const isLoopbackHost = rawHost.toLowerCase() === 'localhost'
    || rawHost === '[::1]'
    || rawHost === '127.0.0.1';
  if (parsed.protocol === 'http:' && !isLoopbackHost) {
    throw new Error('Platform API origins outside loopback must use HTTPS.');
  }

  return `${parsed.origin}${PLATFORM_API_BASE_PATH}`;
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** Reads deployment-provided configuration before Angular providers are created. */
export function readPlatformRuntimeConfiguration(
  browserWindow: PlatformWindow | null = typeof window === 'undefined'
    ? null
    : (window as PlatformWindow),
): PlatformRuntimeConfiguration {
  const configuredUrl = browserWindow?.__NEXA_PLATFORM_CONFIG__?.apiBaseUrl;
  const apiBaseUrl = typeof configuredUrl === 'string' && configuredUrl.trim()
    ? normalizeApiBaseUrl(configuredUrl)
    : DEFAULT_PLATFORM_API_BASE_URL;

  return { apiBaseUrl };
}
