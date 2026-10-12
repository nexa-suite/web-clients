import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import { NexaBusinessDocumentsApi } from "./business-documents-api";

describe("NexaBusinessDocumentsApi", () => {
  let api: NexaBusinessDocumentsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: NEXA_API_HTTP_CONFIGURATION,
          useValue: {
            apiBaseUrl: "https://api.nexa.test/api/v1",
            surface: "PORTAL",
            requestTimeoutMs: 30_000,
          },
        },
      ],
    });
    api = TestBed.inject(NexaBusinessDocumentsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("lists documents with server paging and filters without sending buyer scope", () => {
    api
      .list({
        page: 2,
        size: 25,
        documentType: "PAYMENT_RECEIPT",
        status: "GENERATED",
      })
      .subscribe();

    const request = http.expectOne(
      "https://api.nexa.test/api/v1/business-documents?page=2&size=25&documentType=PAYMENT_RECEIPT&status=GENERATED",
    );
    expect(request.request.method).toBe("GET");
    expect(request.request.params.has("clientAccountId")).toBe(false);
    expect(request.request.params.has("access_token")).toBe(false);
    request.flush({ items: [], page: 2, size: 25, total: 0 });
  });

  it("uses the scoped detail route with an encoded document identifier", () => {
    api.getDocument("document / 1").subscribe();

    const request = http.expectOne(
      "https://api.nexa.test/api/v1/business-documents/document%20%2F%201",
    );
    expect(request.request.method).toBe("GET");
    request.flush({ id: "document / 1" });
  });

  it("requests a Buyer order summary with the API idempotency header", () => {
    api
      .requestOrderSummaryPdf(
        "123e4567-e89b-42d3-a456-426614174000",
        "buyer-order-summary-123e4567-e89b-42d3-a456-426614174000",
      )
      .subscribe();

    const request = http.expectOne(
      "https://api.nexa.test/api/v1/business-document-generation-requests",
    );
    expect(request.request.method).toBe("POST");
    expect(request.request.headers.get("Idempotency-Key")).toBe(
      "buyer-order-summary-123e4567-e89b-42d3-a456-426614174000",
    );
    expect(request.request.body).toEqual({
      subjectType: "SALES_ORDER",
      subjectId: "123e4567-e89b-42d3-a456-426614174000",
      documentType: "ORDER_SUMMARY",
      format: "PDF",
    });
    request.flush({
      id: "request-1",
      documentId: "document-1",
      subjectType: "SALES_ORDER",
      subjectId: "123e4567-e89b-42d3-a456-426614174000",
      documentType: "ORDER_SUMMARY",
      format: "PDF",
      status: "PENDING",
      requestedAt: "2026-10-09T10:00:00Z",
      completedAt: null,
    });
  });

  it("downloads the authenticated API response as a blob without adding token query parameters", () => {
    api.download("doc-1").subscribe();

    const request = http.expectOne(
      "https://api.nexa.test/api/v1/business-documents/doc-1/downloads",
    );
    expect(request.request.method).toBe("GET");
    expect(request.request.responseType).toBe("blob");
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.urlWithParams).not.toContain("access_token");
    request.flush(new Blob(["authorized bytes"], { type: "application/pdf" }));
  });

  it("rejects invalid page parameters before making a request", () => {
    expect(() => api.list({ page: -1 })).toThrow(RangeError);
    expect(() => api.list({ size: 101 })).toThrow(RangeError);
    http.expectNone("https://api.nexa.test/api/v1/business-documents");
  });

  it("rejects missing command identifiers before making a request", () => {
    expect(() => api.requestOrderSummaryPdf(" ", "key")).toThrow();
    expect(() => api.requestOrderSummaryPdf("order-1", " ")).toThrow();
    http.expectNone(
      "https://api.nexa.test/api/v1/business-document-generation-requests",
    );
  });
});
