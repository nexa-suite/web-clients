import { TestBed } from "@angular/core/testing";
import { NexaBusinessDocumentsApi } from "@nexa/api";
import { of } from "rxjs";
import { PlatformBusinessDocumentsApiAdapter } from "./business-documents-api.adapter";

describe("PlatformBusinessDocumentsApiAdapter", () => {
  let api: { requestOrderSummaryPdf: ReturnType<typeof vi.fn> };
  let adapter: PlatformBusinessDocumentsApiAdapter;

  beforeEach(() => {
    api = {
      requestOrderSummaryPdf: vi.fn().mockReturnValue(
        of({
          id: "generation-request-1",
          documentId: "document-1",
          subjectType: "SALES_ORDER",
          subjectId: "sales-order-1",
          documentType: "ORDER_SUMMARY",
          format: "PDF",
          status: "REQUESTED",
          requestedAt: "2026-10-09T10:05:00Z",
          completedAt: null,
        }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        PlatformBusinessDocumentsApiAdapter,
        { provide: NexaBusinessDocumentsApi, useValue: api },
      ],
    });
    adapter = TestBed.inject(PlatformBusinessDocumentsApiAdapter);
  });

  afterEach(() => TestBed.resetTestingModule());

  it("accepts only the API response for the requested Sales Order summary PDF", async () => {
    await expect(
      adapter.requestOrderSummaryPdf("sales-order-1", "retry-identity"),
    ).resolves.toEqual({
      id: "generation-request-1",
      documentId: "document-1",
      status: "REQUESTED",
      requestedAt: "2026-10-09T10:05:00Z",
      completedAt: null,
    });
    expect(api.requestOrderSummaryPdf).toHaveBeenCalledWith(
      "sales-order-1",
      "retry-identity",
    );
  });

  it("rejects a generation response that names a different subject", async () => {
    api.requestOrderSummaryPdf.mockReturnValueOnce(
      of({
        id: "generation-request-1",
        documentId: "document-1",
        subjectType: "SALES_ORDER",
        subjectId: "other-order",
        documentType: "ORDER_SUMMARY",
        format: "PDF",
        status: "REQUESTED",
        requestedAt: "2026-10-09T10:05:00Z",
        completedAt: null,
      }),
    );

    await expect(
      adapter.requestOrderSummaryPdf("sales-order-1", "retry-identity"),
    ).rejects.toBeTruthy();
  });
});
