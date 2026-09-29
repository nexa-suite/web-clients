import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NEXA_API_HTTP_CONFIGURATION } from './nexa-http';

export type NexaQueryValue = string | number | boolean | null | undefined;

export interface NexaHttpRequestOptions {
  readonly query?: Readonly<Record<string, NexaQueryValue>>;
}

@Injectable({ providedIn: 'root' })
export class NexaHttpClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl;

  get<T>(path: string, options: NexaHttpRequestOptions = {}): Promise<T> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined) params = params.set(key, String(value));
    }
    return firstValueFrom(this.http.get<T>(this.apiUrl(path), { params }));
  }

  post<T>(path: string, body: unknown = null): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.apiUrl(path), body));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(this.apiUrl(path), body));
  }

  private apiUrl(path: string): string {
    let resolved: URL;
    try {
      resolved = new URL(path, 'https://nexa.invalid');
    } catch {
      throw new Error('Nexa API requests must use an API-relative path.');
    }
    if (
      !path.startsWith('/') ||
      path.includes('://') ||
      resolved.origin !== 'https://nexa.invalid' ||
      resolved.pathname !== path ||
      Boolean(resolved.search || resolved.hash)
    ) {
      throw new Error('Nexa API requests must use an API-relative path.');
    }
    return this.baseUrl + path;
  }
}
