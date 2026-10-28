import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../../http/nexa-http";
import { NexaBuyerCatalogFavoritesApi } from "./buyer-catalog-favorites-api";

describe("NexaBuyerCatalogFavoritesApi", () => {
  let http: HttpTestingController;
  let api: NexaBuyerCatalogFavoritesApi;
  const skuId = "00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(NexaBuyerCatalogFavoritesApi);
  });

  afterEach(() => http.verify());

  it("requests a bounded Buyer favorites page", () => {
    api.list({ page: 1, size: 50 }).subscribe();

    const request = http.expectOne(
      (value) => value.url === "/api/v1/buyer/favorites",
    );
    expect(request.request.method).toBe("GET");
    expect(request.request.params.get("page")).toBe("1");
    expect(request.request.params.get("size")).toBe("50");
    request.flush({ items: [], page: 1, size: 50, totalItems: 0, totalPages: 0 });
  });

  it("uses the Sellable SKU ID for idempotent preference creation and removal", () => {
    api.add(skuId).subscribe();
    const create = http.expectOne(`/api/v1/buyer/favorites/${skuId}`);
    expect(create.request.method).toBe("PUT");
    expect(create.request.body).toBeNull();
    create.flush({
      sellableSkuId: skuId,
      favoritedAt: "2026-10-27T12:00:00Z",
      currentOffer: null,
    });

    api.remove(skuId).subscribe();
    const remove = http.expectOne(`/api/v1/buyer/favorites/${skuId}`);
    expect(remove.request.method).toBe("DELETE");
    remove.flush(null);
  });

  it("rejects a malformed Sellable SKU ID before making a request", () => {
    expect(() => api.add("not-a-uuid")).toThrow(
      "A valid Sellable SKU ID is required.",
    );
    http.expectNone((request) => request.url.includes("/buyer/favorites"));
  });
});
