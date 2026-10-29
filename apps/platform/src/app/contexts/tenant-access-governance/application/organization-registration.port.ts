import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import type { RegistrationSnapshot } from '@nexa/api';

/** Published legal material must be supplied by its authorized owner. */
export interface RegistrationTermsPublication {
  readonly version: string;
  readonly title: string;
  readonly text: string;
}

export const REGISTRATION_TERMS_PUBLICATION = new InjectionToken<RegistrationTermsPublication | null>(
  'REGISTRATION_TERMS_PUBLICATION', { providedIn: 'root', factory: () => null },
);

export abstract class OrganizationRegistrationPort {
  abstract create(): Observable<RegistrationSnapshot>;
  abstract read(id: string, token: string): Observable<RegistrationSnapshot>;
  abstract save(id: string, token: string, step: number, values: Readonly<Record<string, unknown>>,
    etag: string, key: string): Observable<RegistrationSnapshot>;
  abstract submit(id: string, token: string, etag: string, key: string): Observable<RegistrationSnapshot>;
}
