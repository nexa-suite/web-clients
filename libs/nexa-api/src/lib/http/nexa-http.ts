import { DOCUMENT } from '@angular/common';
import {
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import {
  HttpInterceptorFn,
  HttpContextToken,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { catchError, throwError, timeout } from 'rxjs';
import { NexaAccessTokenStore } from './access-token.store';
import { mapNexaApiError } from './api-error';

export interface NexaRequestPolicy {
  readonly omitBearer?: boolean;
  readonly withCredentials?: boolean;
  readonly headers?: Readonly<Record<string, string>>;
}

export const NEXA_REQUEST_POLICY = new HttpContextToken<NexaRequestPolicy>(() => ({}));

export interface NexaApiHttpConfiguration {
  apiBaseUrl: string;
  surface: string;
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

  const policy = request.context.get(NEXA_REQUEST_POLICY);
  let headers = request.headers;
  for (const [name, value] of Object.entries(policy.headers ?? {})) {
    headers = headers.set(name, value);
  }
  const accessToken = accessTokens.read();
  if (accessToken && !policy.omitBearer && !headers.has('Authorization')) {
    headers = headers.set('Authorization', 'Bearer ' + accessToken);
  }

  const outgoingRequest = request.clone({
    headers,
    withCredentials: request.withCredentials || policy.withCredentials === true,
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
