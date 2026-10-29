import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaPlatformCatalogApi } from "./platform-catalog-api";
import { NexaPlatformCatalogManagementApi } from "./catalog-management-api";

describe("platform catalog APIs", () => {
  let http: HttpTestingController;
  let catalog: NexaPlatformCatalogApi;
  let management: NexaPlatformCatalogManagementApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PLATFORM" }),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    catalog = TestBed.inject(NexaPlatformCatalogApi);
    management = TestBed.inject(NexaPlatformCatalogManagementApi);
  });

  afterEach(() => http.verify());

  it("sends product brand and category filters with server search and paging", () => {
    catalog.list("  oral care ", 2, "ACTIVE", "  Northwind  ", "  Personal care  ").subscribe();

    const request = http.expectOne((r) => r.url === "/api/v1/catalog/products");
    expect(request.request.params.get("search")).toBe("oral care");
    expect(request.request.params.get("brand")).toBe("Northwind");
    expect(request.request.params.get("category")).toBe("Personal care");
    expect(request.request.params.get("status")).toBe("ACTIVE");
    expect(request.request.params.get("page")).toBe("2");
    expect(request.request.params.get("size")).toBe("25");
    request.flush({ items: [], page: 2, size: 25, total: 50 });
  });

  it("sends product-family brand and category filters before server paging", () => {
    management.families("cereal", 1, "Northwind", "Grocery").subscribe();

    const request = http.expectOne((r) => r.url === "/api/v1/product-families");
    expect(request.request.params.get("search")).toBe("cereal");
    expect(request.request.params.get("brand")).toBe("Northwind");
    expect(request.request.params.get("category")).toBe("Grocery");
    expect(request.request.params.get("page")).toBe("1");
    expect(request.request.params.get("size")).toBe("25");
    request.flush({ items: [], page: 1, size: 25, total: 26 });
  });

  it("omits blank optional product filters", () => {
    catalog.list().subscribe();

    const request = http.expectOne((r) => r.url === "/api/v1/catalog/products");
    expect(request.request.params.get("brand")).toBeNull();
    expect(request.request.params.get("category")).toBeNull();
    request.flush({ items: [], page: 0, size: 25, total: 0 });
  });
});
