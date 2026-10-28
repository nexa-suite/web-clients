import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { NexaAccessTokenStore } from "../../../http/access-token.store";
import { provideNexaHttp } from "../../../http/nexa-http";
import type { CurrentBuyerAccountResponse } from "../contracts/buyer-account.contracts";
import { NexaBuyerRelationshipsApi } from "./buyer-relationships-api";

describe("NexaBuyerRelationshipsApi", () => {
  it("resolves the buyer account from server session scope without a client-selected account", () => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }),
        provideHttpClientTesting(),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(NexaAccessTokenStore).set("current-buyer-token");
    let account: CurrentBuyerAccountResponse | null = null;
    TestBed.inject(NexaBuyerRelationshipsApi)
      .getCurrentAccount()
      .subscribe((value) => (account = value));
    const request = http.expectOne("/api/v1/client-accounts/me");
    expect(request.request.method).toBe("GET");
    expect(request.request.headers.get("Authorization")).toBe(
      "Bearer current-buyer-token",
    );
    expect(request.request.params.keys()).toEqual([]);
    const safeSelfResponse: CurrentBuyerAccountResponse = {
      id: "account-1",
      code: "BUYER-1",
      businessName: "Buyer Company",
      commercialName: null,
      countryCode: "PE",
      taxType: "RUC",
      taxValue: "TEST-ID",
      segment: null,
      deliveryProfile: null,
      paymentCondition: null,
      status: "ACTIVE",
      buyerMembershipId: "membership-1",
      version: 1,
      accountType: "BUSINESS",
    };
    request.flush(safeSelfResponse);
    expect(account).toEqual(safeSelfResponse);
    expect("buyerMembershipId" in (account ?? {})).toBe(true);
    expect("contactEmail" in (account ?? {})).toBe(false);
    http.verify();
  });
  it("encodes the server-resolved account address path and retains bearer authority", () => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }),
        provideHttpClientTesting(),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(NexaAccessTokenStore).set("current-buyer-token");
    TestBed.inject(NexaBuyerRelationshipsApi)
      .listAccountAddresses("account/a")
      .subscribe();
    const request = http.expectOne(
      "/api/v1/client-accounts/account%2Fa/addresses",
    );
    expect(request.request.headers.get("Authorization")).toBe(
      "Bearer current-buyer-token",
    );
    request.flush([]);
    http.verify();
  });
});
