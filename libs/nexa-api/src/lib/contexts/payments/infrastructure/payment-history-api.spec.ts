import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaPaymentHistoryApi } from "./payment-history-api";
describe("Buyer payment history scope", () => {
  it("encodes receivable IDs and requests a server-authorized page", () => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }),
        provideHttpClientTesting(),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(NexaPaymentHistoryApi)
      .forReceivable("id/with slash", 1)
      .subscribe();
    const payments = http.expectOne(
      (r) => r.url === "/api/v1/receivables/id%2Fwith%20slash/payments",
    );
    expect(payments.request.params.get("page")).toBe("1");
    payments.flush({ items: [], page: 1, size: 25, total: 0 });
    http.verify();
  });
});
