import { TestBed } from "@angular/core/testing";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaBuyerDeliveriesApi } from "./buyer-deliveries-api";
describe("Buyer delivery query transport", () => {
  it("requests server-scoped delivery pages without a Buyer or Tenant selector", () => {
    TestBed.configureTestingModule({ providers: [provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(NexaBuyerDeliveriesApi).list(2).subscribe();
    const request = http.expectOne(req => req.url === "/api/v1/dispatch-orders");
    expect(request.request.params.keys().sort()).toEqual(["page", "size"]);
    expect(request.request.params.get("page")).toBe("2");
    request.flush({ items: [], page: 2, size: 25, total: 0 });
    http.verify();
  });
  it("encodes the selected delivery ID for detail and history", () => {
    TestBed.configureTestingModule({ providers: [provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const api = TestBed.inject(NexaBuyerDeliveriesApi);
    api.detail("delivery/1").subscribe();
    api.events("delivery/1").subscribe();
    http.expectOne("/api/v1/dispatch-orders/delivery%2F1").flush({ id: "delivery/1" });
    http.expectOne("/api/v1/dispatch-orders/delivery%2F1/events").flush([]);
    http.verify();
  });
});
