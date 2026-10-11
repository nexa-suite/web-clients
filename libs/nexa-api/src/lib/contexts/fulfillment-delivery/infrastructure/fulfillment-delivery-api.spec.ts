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

  it("reads the minimal current outgoing-check summary for dispatch", () => {
    let received: unknown;
    api
      .getCurrentDispatchOutgoingGoodsCheckSummary("fulfillment/1")
      .subscribe((value) => (received = value));

    const request = http.expectOne(
      "https://api.example.test/api/v1/fulfillments/fulfillment%2F1/outgoing-checks/current-summary",
    );
    expect(request.request.method).toBe("GET");
    request.flush(
      {
        id: "check-1",
        fulfillmentId: "fulfillment/1",
        fulfillmentVersion: 5,
        physicalAllocationId: "allocation-1",
        physicalAllocationVersion: 7,
        matches: true,
        current: true,
        openDiscrepancy: false,
      },
      { status: 200, statusText: "OK", headers: { ETag: '"5"' } },
    );

    expect(received).toEqual({
      body: {
        id: "check-1",
        fulfillmentId: "fulfillment/1",
        fulfillmentVersion: 5,
        physicalAllocationId: "allocation-1",
        physicalAllocationVersion: 7,
        matches: true,
        current: true,
        openDiscrepancy: false,
      },
      etag: '"5"',
    });
  });

  it("reads the current Delivery and treats an empty POD response as not captured", () => {
    let delivery: unknown;
    let pod: unknown = "pending";
    api.getDelivery("delivery/1").subscribe((value) => (delivery = value));
    api.getCurrentPod("delivery/1").subscribe((value) => (pod = value));

    const deliveryRequest = http.expectOne(
      "https://api.example.test/api/v1/deliveries/delivery%2F1",
    );
    expect(deliveryRequest.request.method).toBe("GET");
    deliveryRequest.flush(
      {
        id: "delivery/1",
        fulfillmentId: "fulfillment-1",
        salesOrderId: "order-1",
        status: "DELIVERED",
        destinationSnapshot: null,
        scheduledAt: null,
        dispatchedAt: "2026-10-11T10:00:00Z",
        deliveredAt: "2026-10-11T10:15:00Z",
        version: 18,
        attempts: [],
      },
      { status: 200, statusText: "OK", headers: { ETag: '"18"' } },
    );

    const podRequest = http.expectOne(
      "https://api.example.test/api/v1/deliveries/delivery%2F1/pod",
    );
    expect(podRequest.request.method).toBe("GET");
    podRequest.flush(null, { status: 204, statusText: "No Content" });

    expect(delivery).toMatchObject({
      body: { id: "delivery/1", status: "DELIVERED", version: 18 },
      etag: '"18"',
    });
    expect(pod).toBeNull();
  });

  it("seals a POD with the current Delivery ETag and stable idempotency key", () => {
    let received: unknown;
    api
      .sealPod("delivery-1", '"18"', "stable-seal-key")
      .subscribe((value) => (received = value));

    const request = http.expectOne(
      "https://api.example.test/api/v1/deliveries/delivery-1/pod/seals",
    );
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({});
    expect(request.request.headers.get("If-Match")).toBe('"18"');
    expect(request.request.headers.get("Idempotency-Key")).toBe(
      "stable-seal-key",
    );
    request.flush(
      {
        id: "pod-1",
        deliveryId: "delivery-1",
        status: "SEALED",
        receiverName: "Verified receiver",
        capturedAt: "2026-10-11T10:15:00Z",
        sealedAt: "2026-10-11T10:20:00Z",
        photoEvidenceObjectId: null,
        signatureEvidenceObjectId: null,
        deliveryVersion: 19,
      },
      { status: 200, statusText: "OK", headers: { ETag: '"19"' } },
    );

    expect(received).toMatchObject({
      body: { id: "pod-1", deliveryId: "delivery-1", status: "SEALED" },
      etag: '"19"',
    });
  });
});
