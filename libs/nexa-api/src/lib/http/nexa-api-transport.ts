import {
  HttpClient,
  HttpHeaders,
  HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { NEXA_API_HTTP_CONFIGURATION } from './nexa-http';

export type NexaApiQueryValue = string | number | boolean | null | undefined;
export type NexaApiHeaderValue = string | number;

export interface NexaApiRequestOptions {
  readonly query?: Readonly<Record<string, NexaApiQueryValue>>;
  readonly headers?: HttpHeaders | Readonly<Record<string, NexaApiHeaderValue>>;
  readonly correlationId?: string;
}

/** Shared, validated request construction for Platform and Buyer Portal. */
@Injectable({ providedIn: 'root' })
export class NexaApiTransport {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = validateApiBaseUrl(
    inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl,
  );

  get<T>(path: string, options: NexaApiRequestOptions = {}): Observable<T> {
    const request = this.requestOptions(options);
    return this.http.get<T>(this.apiUrl(path), request);
  }

  getResponse<T>(
    path: string,
    options: NexaApiRequestOptions = {},
  ): Observable<HttpResponse<T>> {
    return this.http.get<T>(this.apiUrl(path), {
      ...this.requestOptions(options),
      observe: 'response',
    });
  }

  post<T>(
    path: string,
    body: unknown = null,
    options: NexaApiRequestOptions = {},
  ): Observable<T> {
    return this.http.post<T>(this.apiUrl(path), body, this.requestOptions(options));
  }

  postResponse<T>(
    path: string,
    body: unknown = null,
    options: NexaApiRequestOptions = {},
  ): Observable<HttpResponse<T>> {
    return this.http.post<T>(this.apiUrl(path), body, {
      ...this.requestOptions(options),
      observe: 'response',
    });
  }

  put<T>(
    path: string,
    body: unknown,
    options: NexaApiRequestOptions = {},
  ): Observable<T> {
    return this.http.put<T>(this.apiUrl(path), body, this.requestOptions(options));
  }

  putResponse<T>(
    path: string,
    body: unknown,
    options: NexaApiRequestOptions = {},
  ): Observable<HttpResponse<T>> {
    return this.http.put<T>(this.apiUrl(path), body, {
      ...this.requestOptions(options),
      observe: 'response',
    });
  }

  delete<T>(path: string, options: NexaApiRequestOptions = {}): Observable<T> {
    return this.http.delete<T>(this.apiUrl(path), this.requestOptions(options));
  }

  deleteResponse<T>(
    path: string,
    options: NexaApiRequestOptions = {},
  ): Observable<HttpResponse<T>> {
    return this.http.delete<T>(this.apiUrl(path), {
      ...this.requestOptions(options),
      observe: 'response',
    });
  }

  private requestOptions(options: NexaApiRequestOptions) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined) {
        params = params.set(key, String(value));
      }
    }

    let headers = options.headers instanceof HttpHeaders
      ? options.headers
      : new HttpHeaders(options.headers);
    if (options.correlationId?.trim()) {
      headers = headers.set('X-Correlation-ID', options.correlationId.trim());
    }
    return { params, headers };
  }

  private apiUrl(path: string): string {
    let resolved: URL;
    try {
      resolved = new URL(path, 'https://nexa.invalid');
    } catch {
      throw invalidApiPath();
    }

    if (
      !path.startsWith('/') ||
      path.includes('://') ||
      resolved.origin !== 'https://nexa.invalid' ||
      resolved.pathname !== path ||
      Boolean(resolved.search || resolved.hash)
    ) {
      throw invalidApiPath();
    }
    return this.baseUrl + path;
  }
}

function validateApiBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  if (!normalized || normalized.includes('?') || normalized.includes('#')) {
    throw new Error('Nexa API base URL must be an HTTP(S) origin and API path.');
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized, 'https://nexa.invalid');
  } catch {
    throw new Error('Nexa API base URL must be an HTTP(S) origin and API path.');
  }

  const relative = normalized.startsWith('/') && !normalized.startsWith('//');
  const rawPath = relative
    ? normalized
    : normalized.match(/^https?:\/\/[^/?#]*(\/[^?#]*)?/i)?.[1] ?? '/';
  const host = relative ? '' : parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (
    (!relative && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    (!relative && (parsed.username || parsed.password)) ||
    (!relative && !parsed.pathname.startsWith('/')) ||
    (relative && parsed.origin !== 'https://nexa.invalid') ||
    rawPath !== parsed.pathname ||
    parsed.pathname === '/' ||
    (parsed.protocol === 'http:' && !loopback)
  ) {
    throw new Error('Nexa API base URL must be an HTTP(S) origin and API path.');
  }

  return relative ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
}

function invalidApiPath(): Error {
  return new Error('Nexa API requests must use an API-relative path.');
}
