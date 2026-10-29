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

  it("uploads warehouse photo evidence as multipart with idempotency and no forced content type", () => {
    const file = new File(["photo-bytes"], "receiving.jpg", { type: "image/jpeg" });
    let result: unknown;
    api.uploadWarehouseEvidence(
      "123e4567-e89b-42d3-a456-426614174000",
      file,
      "123e4567-e89b-42d3-a456-426614174001",
    ).subscribe((value) => result = value);

    const request = http.expectOne(
      "https://api.nexa.test/api/v1/business-document-evidence",
    );
    expect(request.request.method).toBe("POST");
    expect(request.request.headers.get("Idempotency-Key")).toBe(
      "123e4567-e89b-42d3-a456-426614174001",
    );
    expect(request.request.headers.has("Content-Type")).toBe(false);
    expect(request.request.body).toBeInstanceOf(FormData);
    expect(request.request.body.get("subjectType")).toBe("WAREHOUSE");
    expect(request.request.body.get("subjectId")).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect((request.request.body.get("file") as File).name).toBe("receiving.jpg");
    request.flush({
      id: "123e4567-e89b-42d3-a456-426614174002",
      subjectType: "WAREHOUSE",
      subjectId: "123e4567-e89b-42d3-a456-426614174000",
      lifecycleStatus: "SCANNING",
      declaredContentType: "image/jpeg",
      detectedContentType: null,
      originalFilename: "receiving.jpg",
      checksumSha256: null,
      byteSize: file.size,
      createdAt: "2026-10-15T12:00:00Z",
      scannedAt: null,
      failureCode: null,
      updatedAt: "2026-10-15T12:00:00Z",
      requestedByMembershipId: "123e4567-e89b-42d3-a456-426614174003",
    }, { status: 201, statusText: "Created" });
    expect(result).toEqual(expect.objectContaining({ status: 201 }));
  });

  it("reads typed evidence lifecycle state from its scoped resource route", () => {
    api.getEvidence("evidence-1").subscribe();

    const request = http.expectOne(
      "https://api.nexa.test/api/v1/business-document-evidence/evidence-1",
    );
    expect(request.request.method).toBe("GET");
    request.flush({ id: "evidence-1", lifecycleStatus: "AVAILABLE" });
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

  it("rejects empty evidence files before making a request", () => {
    const file = new File([], "empty.jpg", { type: "image/jpeg" });
    expect(() => api.uploadWarehouseEvidence("warehouse-1", file, "key")).toThrow();
    http.expectNone("https://api.nexa.test/api/v1/business-document-evidence");
  });
});
