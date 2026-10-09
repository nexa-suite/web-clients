import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import { CurrentBuyerAccountResponse } from "../contracts/buyer-account.contracts";

@Injectable({ providedIn: "root" })
export class NexaBuyerRelationshipsApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);

  getCurrentAccount(): Observable<CurrentBuyerAccountResponse> {
    return this.http.get<CurrentBuyerAccountResponse>(
      `${this.configuration.apiBaseUrl}/client-accounts/me`,
    );
  }
}
