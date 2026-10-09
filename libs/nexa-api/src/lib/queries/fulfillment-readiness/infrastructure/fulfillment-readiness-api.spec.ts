import {
  provideHttpClientTesting,
  HttpTestingController,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NexaFulfillmentReadinessApi } from "./fulfillment-readiness-api";
import { provideNexaHttp } from "../../../http/nexa-http";

describe("NexaFulfillmentReadinessApi", () => {
  let api: NexaFulfillmentReadinessApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({
          apiBaseUrl: "https://api.example.test/api/v1",
          surface: "PLATFORM",
        }),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(NexaFulfillmentReadinessApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("reads candidate orders from the current API scope", () => {
    let received: unknown;
    api
      .listOrderFulfillmentCandidates()
      .subscribe((value) => (received = value));

    const request = http.expectOne(
      "https://api.example.test/api/v1/order-fulfillment-candidates?page=0&size=25",
    );
    expect(request.request.method).toBe("GET");
    expect(request.request.withCredentials).toBe(false);
    request.flush({ items: [], page: 0, size: 25, total: 0 });

    expect(received).toEqual({ items: [], page: 0, size: 25, total: 0 });
  });

  it("preserves the Sales Order ETag for a later If-Match command", () => {
    let received: unknown;
    api.getSalesOrder("order/1").subscribe((value) => (received = value));

    const request = http.expectOne(
      "https://api.example.test/api/v1/sales-orders/order%2F1",
    );
    expect(request.request.method).toBe("GET");
    request.flush({ id: "order/1", version: 4 }, { headers: { ETag: '"4"' } });

    expect(received).toEqual({
      body: { id: "order/1", version: 4 },
      etag: '"4"',
    });
  });

  it("loads warehouse work and dispatch readiness from their current projections", () => {
    let work: unknown;
    let readiness: unknown;
    api.listFulfillmentWork().subscribe((value) => (work = value));
    api.listDispatchReadiness().subscribe((value) => (readiness = value));

    http
      .expectOne("https://api.example.test/api/v1/fulfillments?page=0&size=25")
      .flush({ items: [], page: 0, size: 25, totalItems: 0, asOf: "now" });
    http
      .expectOne(
        "https://api.example.test/api/v1/dispatch-readiness?page=0&size=25",
      )
      .flush({ items: [], page: 0, size: 25, totalItems: 0, asOf: "now" });

    expect(work).toEqual({
      items: [],
      page: 0,
      size: 25,
      totalItems: 0,
      asOf: "now",
    });
    expect(readiness).toEqual({
      items: [],
      page: 0,
      size: 25,
      totalItems: 0,
      asOf: "now",
    });
  });
});
