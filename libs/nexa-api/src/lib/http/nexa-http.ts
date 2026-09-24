import { DOCUMENT } from '@angular/common';
import {
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import {
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { catchError, throwError, timeout } from 'rxjs';
import {
  NEXA_AUTH_API_PATHS,
  NexaSurface,
} from '../contracts/authentication.contracts';
import { NexaAccessTokenStore } from './access-token.store';
import { mapNexaApiError } from './api-error';

export interface NexaApiHttpConfiguration {
  apiBaseUrl: string;
  surface: NexaSurface;
  requestTimeoutMs: number;
}

export const NEXA_API_HTTP_CONFIGURATION =
  new InjectionToken<NexaApiHttpConfiguration>('NEXA_API_HTTP_CONFIGURATION');

export function provideNexaHttp(
  configuration: Pick<NexaApiHttpConfiguration, 'apiBaseUrl' | 'surface'> &
    Partial<Pick<NexaApiHttpConfiguration, 'requestTimeoutMs'>>,
): EnvironmentProviders {
  const apiBaseUrl = configuration.apiBaseUrl.trim().replace(/\/+$/, '');
  if (!apiBaseUrl) {
    throw new Error('Nexa API base URL must not be empty.');
  }

  const requestTimeoutMs = configuration.requestTimeoutMs ?? 30_000;
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error('Nexa API request timeout must be a positive number of milliseconds.');
  }

  const normalizedConfiguration: NexaApiHttpConfiguration = {
    apiBaseUrl,
    surface: configuration.surface,
    requestTimeoutMs,
  };

  return makeEnvironmentProviders([
    {
      provide: NEXA_API_HTTP_CONFIGURATION,
      useValue: normalizedConfiguration,
    },
    provideHttpClient(withInterceptors([nexaApiInterceptor])),
  ]);
}

const nexaApiInterceptor: HttpInterceptorFn = (request, next) => {
  const configuration = inject(NEXA_API_HTTP_CONFIGURATION);
  const accessTokens = inject(NexaAccessTokenStore);
  const baseUri = inject(DOCUMENT).baseURI;
  const path = apiRelativePath(request.url, configuration.apiBaseUrl, baseUri);

  if (path === null) {
    return next(request);
  }

  const normalizedPath = path.replace(/\/+$/, '') || '/';
  let headers = request.headers;

  if (normalizedPath === '/authentication/refresh' || normalizedPath === '/authentication/sign-out') {
    headers = headers.set('X-Nexa-Surface', configuration.surface);
  }

  const accessToken = accessTokens.read();
  const bearerExcludedPaths: readonly string[] = [
    NEXA_AUTH_API_PATHS.workspacePreview,
    NEXA_AUTH_API_PATHS.signIn,
    NEXA_AUTH_API_PATHS.refresh,
  ];
  if (
    accessToken &&
    !bearerExcludedPaths.includes(normalizedPath) &&
    !headers.has('Authorization')
  ) {
    headers = headers.set('Authorization', 'Bearer ' + accessToken);
  }

  const browserSessionPaths = [
    '/authentication/sign-in',
    '/authentication/refresh',
    '/authentication/sign-out',
  ];
  const outgoingRequest = request.clone({
    headers,
    withCredentials: request.withCredentials || browserSessionPaths.includes(normalizedPath),
  });

  return next(outgoingRequest).pipe(
    timeout({ first: configuration.requestTimeoutMs }),
    catchError((cause: unknown) => throwError(() => mapNexaApiError(cause))),
  );
};

function apiRelativePath(requestUrl: string, apiBaseUrl: string, baseUri: string): string | null {
  try {
    const base = new URL(apiBaseUrl, baseUri);
    const request = new URL(requestUrl, baseUri);
    const prefix = base.pathname.replace(/\/+$/, '');

    if (request.origin !== base.origin) {
      return null;
    }
    if (request.pathname !== prefix && !request.pathname.startsWith(prefix + '/')) {
      return null;
    }

    return request.pathname.slice(prefix.length) || '/';
  } catch {
    return null;
  }
}
