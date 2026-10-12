import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { NexaAccessTokenStore } from "../../../http/access-token.store";
import { provideNexaHttp } from "../../../http/nexa-http";
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
    let membership: string | null = null;
    TestBed.inject(NexaBuyerRelationshipsApi)
      .getCurrentAccount()
      .subscribe((account) => (membership = account.buyerMembershipId));
    const request = http.expectOne("/api/v1/client-accounts/me");
    expect(request.request.method).toBe("GET");
    expect(request.request.headers.get("Authorization")).toBe(
      "Bearer current-buyer-token",
    );
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ id: "account-1", buyerMembershipId: "membership-1" });
    expect(membership).toBe("membership-1");
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
