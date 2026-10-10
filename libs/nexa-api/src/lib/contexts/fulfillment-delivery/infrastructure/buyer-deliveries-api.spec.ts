import { TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaBuyerDeliveriesApi } from "./buyer-deliveries-api";

const deliveryId = "00000000-0000-4000-8000-000000000001";

describe("Buyer delivery query transport", () => {
  it("requests server-scoped Delivery pages without a Buyer or Tenant selector", () => {
    TestBed.configureTestingModule({ providers: [provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(NexaBuyerDeliveriesApi).list(2).subscribe();
    const request = http.expectOne(req => req.url === "/api/v1/buyer/deliveries");
    expect(request.request.params.keys().sort()).toEqual(["page", "size"]);
    expect(request.request.params.get("page")).toBe("2");
    expect(request.request.params.get("size")).toBe("25");
    request.flush({ items: [], page: 2, size: 25, total: 0 });
    http.verify();
  });

  it("uses only the Buyer Delivery detail and event routes", () => {
    TestBed.configureTestingModule({ providers: [provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const api = TestBed.inject(NexaBuyerDeliveriesApi);
    api.detail(deliveryId).subscribe();
    api.events(deliveryId).subscribe();
    const detail = http.expectOne(`/api/v1/buyer/deliveries/${deliveryId}`);
    const events = http.expectOne(`/api/v1/buyer/deliveries/${deliveryId}/events`);
    expect(detail.request.method).toBe("GET");
    expect(events.request.method).toBe("GET");
    detail.flush({ id: deliveryId, salesOrderNumber: "SO-0001", status: "DISPATCHED" });
    events.flush([{ type: "HANDED_OVER", occurredAt: "2026-10-09T12:00:00Z" }]);
    http.verify();
  });

  it("rejects an identifier that cannot match the API UUID route", () => {
    TestBed.configureTestingModule({ providers: [provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const api = TestBed.inject(NexaBuyerDeliveriesApi);
    expect(() => api.detail("delivery/1")).toThrowError("A valid Delivery ID is required.");
    expect(() => api.events(" ")).toThrowError("A valid Delivery ID is required.");
    http.verify();
  });
});
