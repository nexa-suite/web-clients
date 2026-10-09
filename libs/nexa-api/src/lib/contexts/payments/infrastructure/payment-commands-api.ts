import { HttpClient, HttpHeaders } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type { BankTransferReportRequest, PaymentResponse } from "../contracts/payment-command.contracts";

@Injectable({ providedIn: "root" })
export class NexaPaymentCommandsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(NEXA_API_HTTP_CONFIGURATION);

  reportBankTransfer(receivableId: string, request: BankTransferReportRequest, idempotencyKey: string) {
    if (!receivableId.trim() || !idempotencyKey.trim()) throw new Error("Receivable and retry identity are required.");
    return this.http.post<PaymentResponse>(
      `${this.config.apiBaseUrl}/receivables/${encodeURIComponent(receivableId)}/bank-transfer-payments`,
      request,
      { headers: new HttpHeaders({ "Idempotency-Key": idempotencyKey }) },
    );
  }
}
