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
});
