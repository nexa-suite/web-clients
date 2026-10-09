import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { NexaAccessTokenStore } from "../../../http/access-token.store";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaBuyerCatalogApi } from "./buyer-catalog-api";
import type { BuyerCatalogQuery } from "../contracts/buyer-catalog.contracts";

describe("NexaBuyerCatalogApi", () => {
  let http: HttpTestingController;
  let api: NexaBuyerCatalogApi;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(NexaBuyerCatalogApi);
    TestBed.inject(NexaAccessTokenStore).set("current-buyer-token");
  });
  afterEach(() => http.verify());

  it("uses supported filters and leaves Buyer account resolution to the server", () => {
    api
      .listCatalog({
        q: "frozen & fresh",
        coldChain: "FROZEN",
        page: 0,
        size: 12,
        sort: "itemName",
        direction: "asc",
        clientAccountId: "foreign-account",
      } as BuyerCatalogQuery)
      .subscribe();
    const request = http.expectOne((r) => r.url === "/api/v1/catalog-items");
    expect(request.request.params.get("q")).toBe("frozen & fresh");
    expect(request.request.params.get("coldChain")).toBe("FROZEN");
    expect(request.request.params.get("page")).toBe("0");
    expect(request.request.params.get("clientAccountId")).toBeNull();
    expect(request.request.headers.get("Authorization")).toBe(
      "Bearer current-buyer-token",
    );
    request.flush({
      items: [],
      page: 0,
      size: 12,
      totalItems: 0,
      totalPages: 0,
    });
  });

  it("preserves server-issued commercial precision and availability without recalculation", () => {
    let observed: unknown;
    api
      .getCatalogItem("item/one")
      .subscribe(
        (item) =>
          (observed = {
            price: item.currentOfferPrice,
            availability: item.sellableAvailability,
            pricingAsOf: item.pricingAsOf,
          }),
      );
    const request = http.expectOne("/api/v1/catalog-items/item%2Fone");
    request.flush({
      currentOfferPrice: { amount: "42.4500", currency: "PEN" },
      sellableAvailability: 7,
      pricingAsOf: "2026-10-09T00:00:00Z",
    });
    expect(observed).toEqual({
      price: { amount: "42.4500", currency: "PEN" },
      availability: 7,
      pricingAsOf: "2026-10-09T00:00:00Z",
    });
  });

  it("rejects an empty item identifier before transport", () => {
    let failure: unknown;
    api.getCatalogItem("  ").subscribe({ error: (error) => (failure = error) });
    expect(failure).toBeInstanceOf(Error);
    http.expectNone((r) => true);
  });
});
