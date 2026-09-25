import { inject, Injectable } from '@angular/core';
import type { HttpResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NexaApiTransport } from './nexa-api-transport';
import type {
  NexaApiRequestOptions,
  NexaApiQueryValue,
} from './nexa-api-transport';

export type NexaQueryValue = NexaApiQueryValue;
export type NexaHttpRequestOptions = NexaApiRequestOptions;

@Injectable({ providedIn: 'root' })
export class NexaHttpClient {
  private readonly transport = inject(NexaApiTransport);

  get<T>(path: string, options: NexaHttpRequestOptions = {}): Promise<T> {
    return firstValueFrom(this.transport.get<T>(path, options));
  }

  getResponse<T>(path: string, options: NexaHttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return firstValueFrom(this.transport.getResponse<T>(path, options));
  }

  post<T>(path: string, body: unknown = null, options: NexaHttpRequestOptions = {}): Promise<T> {
    return firstValueFrom(this.transport.post<T>(path, body, options));
  }

  postResponse<T>(path: string, body: unknown = null, options: NexaHttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return firstValueFrom(this.transport.postResponse<T>(path, body, options));
  }

  put<T>(path: string, body: unknown, options: NexaHttpRequestOptions = {}): Promise<T> {
    return firstValueFrom(this.transport.put<T>(path, body, options));
  }

  putResponse<T>(path: string, body: unknown, options: NexaHttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return firstValueFrom(this.transport.putResponse<T>(path, body, options));
  }
}
