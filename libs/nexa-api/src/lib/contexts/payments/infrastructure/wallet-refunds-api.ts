import { HttpClient, HttpHeaders } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type { WalletRefundCandidatesPage, WalletRefundRequest, WalletRefundResponse } from "../contracts/wallet-refund.contracts";

@Injectable({ providedIn: "root" })
export class NexaWalletRefundsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(NEXA_API_HTTP_CONFIGURATION);

  candidates(page = 0, size = 25) {
    return this.http.get<WalletRefundCandidatesPage>(
      `${this.config.apiBaseUrl}/sales-orders/wallet-refund-candidates`,
      { params: { page, size } },
    );
  }

  refund(salesOrderId: string, request: WalletRefundRequest, idempotencyKey: string) {
    if (!salesOrderId.trim() || !idempotencyKey.trim()) {
      throw new Error("Sales Order and retry identity are required.");
    }
    return this.http.post<WalletRefundResponse>(
      `${this.config.apiBaseUrl}/sales-orders/${encodeURIComponent(salesOrderId)}/wallet-refunds`,
      request,
      { headers: new HttpHeaders({ "Idempotency-Key": idempotencyKey }) },
    );
  }
}
