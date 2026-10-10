import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type { BuyerWalletNotInitializedResponse } from "../contracts/buyer-wallet.contracts";
import { NexaBuyerWalletApi } from "./buyer-wallet-api";

describe("NexaBuyerWalletApi", () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: NEXA_API_HTTP_CONFIGURATION,
          useValue: { apiBaseUrl: "/api/v1" },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("reads the current Buyer wallet and paged movements without an account selector", () => {
    let response: BuyerWalletNotInitializedResponse | undefined;
    TestBed.inject(NexaBuyerWalletApi)
      .read()
      .subscribe((value) => (response = value as BuyerWalletNotInitializedResponse));

    const request = http.expectOne("/api/v1/buyer/wallet?page=0&size=25");
    expect(request.request.method).toBe("GET");
    expect(request.request.params.has("clientAccountId")).toBe(false);
    request.flush({
      status: "NOT_INITIALIZED",
      currency: "PEN",
      postedBalance: null,
      reservedBalance: null,
      availableBalance: null,
      movements: { items: [], page: 0, size: 25, total: 0 },
    });
    expect(response?.status).toBe("NOT_INITIALIZED");
    expect(response?.postedBalance).toBeNull();
  });

  it("requests the requested movement page", () => {
    TestBed.inject(NexaBuyerWalletApi).read(2, 25).subscribe();
    const request = http.expectOne("/api/v1/buyer/wallet?page=2&size=25");
    expect(request.request.method).toBe("GET");
    request.flush({
      status: "ACTIVE",
      currency: "PEN",
      postedBalance: 100,
      reservedBalance: 20,
      availableBalance: 80,
      movements: { items: [], page: 2, size: 25, total: 50 },
    });
  });

  it("rejects invalid movement page arguments before sending a request", () => {
    const api = TestBed.inject(NexaBuyerWalletApi);
    expect(() => api.read(-1)).toThrow("non-negative integer");
    expect(() => api.read(0, 101)).toThrow("between 1 and 100");
    http.expectNone("/api/v1/buyer/wallet");
  });
});
