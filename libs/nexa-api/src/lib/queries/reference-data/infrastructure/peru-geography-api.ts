import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type { PeruGeographyOption } from "../contracts/peru-geography.contracts";

/** Read transport for the API's authenticated Peru geography reference data. */
@Injectable({ providedIn: "root" })
export class NexaPeruGeographyApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl;

  departments(): Observable<readonly PeruGeographyOption[]> {
    return this.http.get<readonly PeruGeographyOption[]>(
      `${this.base}/reference/departments`,
    );
  }

  provinces(
    departmentCode: string,
  ): Observable<readonly PeruGeographyOption[]> {
    return this.http.get<readonly PeruGeographyOption[]>(
      `${this.base}/reference/departments/${encodeURIComponent(departmentCode)}/provinces`,
    );
  }

  districts(provinceCode: string): Observable<readonly PeruGeographyOption[]> {
    return this.http.get<readonly PeruGeographyOption[]>(
      `${this.base}/reference/provinces/${encodeURIComponent(provinceCode)}/districts`,
    );
  }
}
