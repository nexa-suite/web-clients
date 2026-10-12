import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type { PaymentHistoryPageResponse } from "../contracts/payment-history.contracts";
@Injectable({ providedIn: "root" })
export class NexaPaymentHistoryApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(NEXA_API_HTTP_CONFIGURATION);
  forReceivable(receivableId: string, page = 0) {
    if (!receivableId.trim()) throw new Error("Receivable ID is required.");
    return this.http.get<PaymentHistoryPageResponse>(
      `${this.config.apiBaseUrl}/receivables/${encodeURIComponent(receivableId)}/payments`,
      { params: { page, size: 25 } },
    );
  }
}
