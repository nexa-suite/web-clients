import { TestBed } from "@angular/core/testing";
import { NexaApiError, NexaBusinessDocumentsApi } from "@nexa/api";
import type {
  BusinessDocumentPageResponse,
  BusinessDocumentResponse,
} from "@nexa/api";
import { of } from "rxjs";
import { BusinessDocumentsApiAdapter } from "./business-documents-api.adapter";

describe("BusinessDocumentsApiAdapter", () => {
  let adapter: BusinessDocumentsApiAdapter;
  const api = { list: vi.fn(), getDocument: vi.fn(), download: vi.fn() };

  const document: BusinessDocumentResponse = {
    id: "doc-1",
    clientAccountId: "client-private",
    subjectType: "SALES_ORDER",
    subjectId: "order-1",
    documentType: "ORDER_SUMMARY",
    documentNumber: "SO-2026-001",
    version: 1,
    status: "GENERATED",
    format: "PDF",
    storageObjectKey: "private/tenant/document.pdf",
    checksumSha256: "private-checksum",
    contentType: "application/pdf",
    byteSize: 1200,
    generatedAt: "2026-10-09T10:00:00Z",
    failureCode: null,
    failureDetail: null,
    createdAt: "2026-10-09T10:00:00Z",
    updatedAt: "2026-10-09T10:00:00Z",
    replacementOfDocumentId: null,
  };

  beforeEach(() => {
    api.list.mockReset();
    api.getDocument.mockReset();
    api.download.mockReset();
    TestBed.configureTestingModule({
      providers: [
        BusinessDocumentsApiAdapter,
        { provide: NexaBusinessDocumentsApi, useValue: api },
      ],
    });
    adapter = TestBed.inject(BusinessDocumentsApiAdapter);
  });

  it("projects Buyer-safe document facts and derives download availability from issued status", async () => {
    const response: BusinessDocumentPageResponse = {
      items: [
        document,
        {
          ...document,
          id: "doc-2",
          status: "REQUESTED",
          storageObjectKey: "private/pending.pdf",
        },
      ],
      page: 1,
      size: 25,
      total: 26,
    };
    api.list.mockReturnValue(of(response));

    const page = await adapter.list(1);

    expect(api.list).toHaveBeenCalledWith({ page: 1, size: 25 });
    expect(page).toMatchObject({ page: 1, size: 25, total: 26, totalPages: 2 });
    expect(page.items[0]).toMatchObject({
      id: "doc-1",
      documentNumber: "SO-2026-001",
      documentType: "ORDER_SUMMARY",
      downloadable: true,
    });
    expect(page.items[0]).not.toHaveProperty("clientAccountId");
    expect(page.items[0]).not.toHaveProperty("storageObjectKey");
    expect(page.items[0]).not.toHaveProperty("checksumSha256");
    expect(page.items[1].downloadable).toBe(false);
  });

  it("keeps superseded immutable documents available for verification downloads", async () => {
    api.getDocument.mockReturnValue(of({ ...document, status: "SUPERSEDED" }));

    await expect(adapter.detail("doc-1")).resolves.toMatchObject({
      id: "doc-1",
      status: "SUPERSEDED",
      downloadable: true,
    });
    expect(api.getDocument).toHaveBeenCalledWith("doc-1");
  });

  it("fails closed when paging metadata or document fields are malformed", async () => {
    api.list.mockReturnValue(
      of({ items: [document], page: -1, size: 0, total: 1 }),
    );
    await expect(adapter.list(0)).rejects.toBeInstanceOf(NexaApiError);

    api.getDocument.mockReturnValue(of({ ...document, format: "EXE" }));
    await expect(adapter.detail("doc-1")).rejects.toBeInstanceOf(NexaApiError);
  });

  it("returns the response body as a blob for the authenticated download adapter", async () => {
    const content = new Blob(["private document"], { type: "application/pdf" });
    api.download.mockReturnValue(of({ body: content }));

    await expect(adapter.download("doc-1")).resolves.toBe(content);
    expect(api.download).toHaveBeenCalledWith("doc-1");
  });
});
