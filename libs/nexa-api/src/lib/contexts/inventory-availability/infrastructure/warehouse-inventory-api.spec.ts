import { TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaWarehouseInventoryApi } from "./warehouse-inventory-api";

describe("Warehouse inventory transport", () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [
      provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PLATFORM" }),
      provideHttpClientTesting(),
    ],
  }));

  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it("loads paginated authorized warehouses and zones without client scope selectors", () => {
    const http = TestBed.inject(HttpTestingController);
    const api = TestBed.inject(NexaWarehouseInventoryApi);
    api.listWarehouses(1, 100).subscribe();
    api.listZones("00000000-0000-4000-8000-000000000001", 0, 100).subscribe();

    const warehouses = http.expectOne((request) =>
      request.url === "/api/v1/warehouses" &&
      request.params.get("page") === "1" &&
      request.params.get("size") === "100" &&
      request.params.get("sort") === "code,asc",
    );
    const zones = http.expectOne("/api/v1/warehouses/00000000-0000-4000-8000-000000000001/zones?page=0&size=100");
    expect(warehouses.request.method).toBe("GET");
    expect(zones.request.method).toBe("GET");
    expect(warehouses.request.params.keys()).toEqual(["page", "size", "sort"]);
    warehouses.flush({ items: [], page: 1, size: 100, total: 0 });
    zones.flush({ items: [], page: 0, size: 100, total: 0 });
  });

  it("sorts lot pages by expiry and forwards filters", () => {
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(NexaWarehouseInventoryApi).listLots({
      page: 2,
      size: 25,
      warehouseId: "warehouse-1",
      zoneId: "zone-1",
      catalogItemId: "CAT-001",
      status: "HOLD",
    }).subscribe();

    const request = http.expectOne((candidate) => candidate.url === "/api/v1/inventory/lots");
    expect(request.request.params.get("sort")).toBe("expirationDate,asc");
    expect(request.request.params.get("warehouseId")).toBe("warehouse-1");
    expect(request.request.params.get("zoneId")).toBe("zone-1");
    expect(request.request.params.get("catalogItemId")).toBe("CAT-001");
    expect(request.request.params.get("status")).toBe("HOLD");
    request.flush({ items: [], page: 2, size: 25, total: 0 });
  });

  it("sends frozen receipt with idempotency key and exposes creation status plus ETag", () => {
    const http = TestBed.inject(HttpTestingController);
    const api = TestBed.inject(NexaWarehouseInventoryApi);
    const request = {
      warehouseId: "00000000-0000-4000-8000-000000000001",
      zoneId: "00000000-0000-4000-8000-000000000002",
      catalogItemId: "CAT-001",
      batchNumber: "BATCH-001",
      expirationDate: "2027-06-30",
      productionDate: "2026-06-30",
      receivedAt: "2026-10-15T12:00:00Z",
      quantity: 5,
      unit: "kg",
      temperatureReading: 4,
      notes: null,
      skuId: null,
    };
    let result: unknown;
    api.receive(request, "123e4567-e89b-42d3-a456-426614174000").subscribe((value) => (result = value));

    const post = http.expectOne("/api/v1/inventory/inbound-receipts");
    expect(post.request.method).toBe("POST");
    expect(post.request.headers.get("Idempotency-Key")).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(post.request.body).toEqual(request);
    post.flush({ id: "lot-1" }, { status: 201, statusText: "Created", headers: { ETag: '"7"' } });

    expect(result).toEqual({ body: { id: "lot-1" }, etag: '"7"', status: 201 });
  });
});
