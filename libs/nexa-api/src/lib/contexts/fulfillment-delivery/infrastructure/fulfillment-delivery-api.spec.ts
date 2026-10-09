import {
  provideHttpClientTesting,
  HttpTestingController,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NexaFulfillmentDeliveryApi } from "./fulfillment-delivery-api";
import { provideNexaHttp } from "../../../http/nexa-http";

describe("NexaFulfillmentDeliveryApi", () => {
  let api: NexaFulfillmentDeliveryApi;
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
    api = TestBed.inject(NexaFulfillmentDeliveryApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("starts fulfillment with the server-issued ETag and a stable idempotency key", () => {
    let received: unknown;
    api
      .startFulfillment("order/1", '"4"', "stable-start-key")
      .subscribe((value) => (received = value));

    const request = http.expectOne(
      "https://api.example.test/api/v1/sales-orders/order%2F1/fulfillments",
    );
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get("If-Match")).toBe('"4"');
    expect(request.request.headers.get("Idempotency-Key")).toBe(
      "stable-start-key",
    );
    request.flush(
      { id: "fulfillment-1", salesOrderId: "order/1", version: 1 },
      { status: 201, statusText: "Created", headers: { ETag: '"1"' } },
    );

    expect(received).toEqual({
      body: { id: "fulfillment-1", salesOrderId: "order/1", version: 1 },
      etag: '"1"',
    });
  });

  it("refuses to send a start command without both concurrency and retry tokens", () => {
    expect(() => api.startFulfillment("order-1", "", "key")).toThrow(/ETag/);
    expect(() => api.startFulfillment("order-1", '"4"', "")).toThrow(
      /Idempotency-Key/,
    );
  });
});
