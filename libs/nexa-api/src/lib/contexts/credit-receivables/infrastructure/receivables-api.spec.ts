import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaAccessTokenStore } from "../../../http/access-token.store";
import { NexaReceivablesApi } from "./receivables-api";

describe("Buyer financial API scope", () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(NexaAccessTokenStore).set("buyer-token");
  });
  afterEach(() => http.verify());
  it("resolves credit from current membership without an account selector and preserves server facts", () => {
    let available: unknown;
    TestBed.inject(NexaReceivablesApi)
      .currentCredit()
      .subscribe((value) => (available = value.availableCredit));
    const request = http.expectOne(
      "/api/v1/client-accounts/me/credit-exposure",
    );
    expect(request.request.headers.get("Authorization")).toBe(
      "Bearer buyer-token",
    );
    expect(request.request.params.has("clientAccountId")).toBe(false);
    request.flush({ availableCredit: 900.01, creditLimit: 1000.05 });
    expect(available).toBe(900.01);
  });
  it("lists only server-scoped receivables and encodes the selected receivable payment history", () => {
    TestBed.inject(NexaReceivablesApi).list(2).subscribe();
    const receivables = http.expectOne((r) => r.url === "/api/v1/receivables");
    expect(receivables.request.params.get("page")).toBe("2");
    expect(receivables.request.params.has("clientAccountId")).toBe(false);
    receivables.flush({ items: [], page: 2, size: 25, total: 0 });
  });
});
