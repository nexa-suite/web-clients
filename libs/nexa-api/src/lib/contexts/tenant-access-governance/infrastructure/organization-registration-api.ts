import { HttpClient, HttpContext, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { NEXA_API_HTTP_CONFIGURATION, NEXA_REQUEST_POLICY } from '../../../http/nexa-http';
import { map } from 'rxjs';
import {
  OrganizationRegistrationDraft, RegistrationSnapshot,
} from '../contracts/organization-registration.contracts';

@Injectable({ providedIn: 'root' })
export class NexaOrganizationRegistrationApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl
    + '/tenant-management/organization-registration-drafts';

  create() {
    return this.http.post<OrganizationRegistrationDraft>(this.base, {}, {
      context: this.policy(), observe: 'response',
    }).pipe(map(snapshot));
  }

  read(id: string, token: string) {
    return this.http.get<OrganizationRegistrationDraft>(`${this.base}/${encodeURIComponent(id)}`, {
      context: this.policy(token), observe: 'response',
    }).pipe(map(snapshot));
  }

  save(id: string, token: string, step: number, values: Readonly<Record<string, unknown>>,
    etag: string, key: string) {
    return this.http.put<OrganizationRegistrationDraft>(
      `${this.base}/${encodeURIComponent(id)}/steps/${step}`, values,
      { context: this.policy(token, etag, key), observe: 'response' },
    ).pipe(map(snapshot));
  }

  submit(id: string, token: string, etag: string, key: string) {
    return this.http.post<OrganizationRegistrationDraft>(`${this.base}/${encodeURIComponent(id)}/submit`, {}, {
      context: this.policy(token, etag, key), observe: 'response',
    }).pipe(map(snapshot));
  }

  private policy(token?: string, etag?: string, key?: string) {
    const headers: Record<string, string> = {};
    if (token) headers['X-Resume-Token'] = token;
    if (etag) headers['If-Match'] = etag;
    if (key) headers['Idempotency-Key'] = key;
    return new HttpContext().set(NEXA_REQUEST_POLICY, { omitBearer: true, headers });
  }
}

function snapshot(response: HttpResponse<OrganizationRegistrationDraft>): RegistrationSnapshot {
  const body = response.body;
  if (!body || !body.registrationId || !Number.isSafeInteger(body.version)) {
    throw new Error('Registration response is incomplete.');
  }
  // The version in the response also supports origins that do not expose ETag.
  return { draft: body, etag: response.headers.get('ETag') ?? `"${body.version}"` };
}
