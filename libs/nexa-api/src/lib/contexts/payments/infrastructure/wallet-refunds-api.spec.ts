import { TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaWalletRefundsApi } from "./wallet-refunds-api";

describe("Wallet refund transport", () => {
  it("reuses the retry key without accepting a client wallet or beneficiary", () => {
    TestBed.configureTestingModule({ providers: [
      provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PLATFORM" }),
      provideHttpClientTesting(),
    ] });
    const http = TestBed.inject(HttpTestingController);
    const api = TestBed.inject(NexaWalletRefundsApi);
    for (let attempt = 0; attempt < 2; attempt++) {
      api.refund("order/1", { amountPEN: 12.5, reason: "Cancelled order" }, "same-intent").subscribe();
      const request = http.expectOne("/api/v1/sales-orders/order%2F1/wallet-refunds");
      expect(request.request.method).toBe("POST");
      expect(request.request.headers.get("Idempotency-Key")).toBe("same-intent");
      expect(request.request.body).toEqual({ amountPEN: 12.5, reason: "Cancelled order" });
      request.flush({ status: "POSTED" });
    }
    http.verify();
  });
});
