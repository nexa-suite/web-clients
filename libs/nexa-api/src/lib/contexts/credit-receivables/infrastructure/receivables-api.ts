import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type {
  ReceivablesPageResponse,
  BuyerCreditExposureResponse,
} from "../contracts/receivables.contracts";
@Injectable({ providedIn: "root" })
export class NexaReceivablesApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(NEXA_API_HTTP_CONFIGURATION);
  currentCredit() {
    return this.http.get<BuyerCreditExposureResponse>(
      `${this.config.apiBaseUrl}/client-accounts/me/credit-exposure`,
    );
  }
  list(page = 0) {
    return this.http.get<ReceivablesPageResponse>(
      `${this.config.apiBaseUrl}/receivables`,
      { params: { page, size: 25 } },
    );
  }
}
