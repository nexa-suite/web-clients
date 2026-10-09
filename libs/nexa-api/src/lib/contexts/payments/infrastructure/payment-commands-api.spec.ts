import { TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaPaymentCommandsApi } from "./payment-commands-api";

describe("Payment command transport", () => {
  it("reports only reference and evidence with the stable key; amount and ownership stay server-derived", () => {
    TestBed.configureTestingModule({ providers: [provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(NexaPaymentCommandsApi).reportBankTransfer("receivable/1", { reference: "TRANSFER-1", proofEvidenceId: null }, "retry-1").subscribe();
    const request = http.expectOne("/api/v1/receivables/receivable%2F1/bank-transfer-payments");
    expect(request.request.method).toBe("POST");
    expect(request.request.headers.get("Idempotency-Key")).toBe("retry-1");
    expect(request.request.body).toEqual({ reference: "TRANSFER-1", proofEvidenceId: null });
    request.flush({ status: "PROCESSING" });
    http.verify();
  });
});
