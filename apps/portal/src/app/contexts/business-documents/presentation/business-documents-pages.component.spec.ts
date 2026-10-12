import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, provideRouter } from "@angular/router";
import type {
  BusinessDocumentDetailState,
  BusinessDocumentListState,
  BuyerBusinessDocument,
} from "../application/business-documents.models";
import { BuyerBusinessDocumentsStore } from "../application/buyer-business-documents.store";
import { BusinessDocumentDetailPageComponent } from "./business-document-detail-page.component";
import { BusinessDocumentsPageComponent } from "./business-documents-page.component";

const generated: BuyerBusinessDocument = {
  id: "doc-issued",
  subjectType: "SALES_ORDER",
  subjectId: "order-1",
  documentType: "ORDER_SUMMARY",
  documentNumber: "SO-2026-001",
  version: 1,
  status: "GENERATED",
  format: "PDF",
  contentType: "application/pdf",
  byteSize: 1200,
  generatedAt: "2026-10-09T10:00:00Z",
  createdAt: "2026-10-09T10:00:00Z",
  replacementOfDocumentId: null,
  downloadable: true,
};

function createPageFixture(state: BusinessDocumentListState) {
  const store = {
    listState: () => state,
    downloadState: () => ({ kind: "idle" as const }),
    load: vi.fn(),
    changePage: vi.fn(),
    download: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [BusinessDocumentsPageComponent],
    providers: [
      provideRouter([]),
      { provide: BuyerBusinessDocumentsStore, useValue: store },
    ],
  });
  const fixture = TestBed.createComponent(BusinessDocumentsPageComponent);
  fixture.detectChanges();
  return { fixture, store };
}

function createDetailFixture(state: BusinessDocumentDetailState) {
  const store = {
    detailState: () => state,
    downloadState: () => ({ kind: "idle" as const }),
    loadDetail: vi.fn(),
    download: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [BusinessDocumentDetailPageComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => "doc-issued" } } },
      },
      { provide: BuyerBusinessDocumentsStore, useValue: store },
    ],
  });
  const fixture = TestBed.createComponent(BusinessDocumentDetailPageComponent);
  fixture.detectChanges();
  return { fixture, store };
}

describe("BusinessDocumentsPageComponent", () => {
  it("shows issued documents and offers a download action only for issued content", () => {
    const pending: BuyerBusinessDocument = {
      ...generated,
      id: "doc-pending",
      documentNumber: null,
      status: "GENERATING",
      generatedAt: null,
      downloadable: false,
    };
    const state: BusinessDocumentListState = {
      kind: "results",
      page: {
        items: [generated, pending],
        page: 0,
        size: 25,
        total: 2,
        totalPages: 1,
      },
    };

    const { fixture, store } = createPageFixture(state);
    const content = fixture.nativeElement.textContent as string;

    expect(store.load).toHaveBeenCalledWith();
    expect(content).toContain("SO-2026-001");
    expect(content).toContain("Available");
    expect(content).toContain("Processing");
    expect(content.match(/Download/g)).toHaveLength(1);
  });
});

describe("BusinessDocumentDetailPageComponent", () => {
  it("loads a scoped document and shows its business facts and available download", () => {
    const { fixture, store } = createDetailFixture({
      kind: "loaded",
      document: generated,
    });
    const content = fixture.nativeElement.textContent as string;

    expect(store.loadDetail).toHaveBeenCalledWith("doc-issued");
    expect(content).toContain("Sales order document");
    expect(content).toContain("SO-2026-001");
    expect(content).toContain("1.2 KB");
    expect(content).toContain("Download document");
  });

  it("does not expose a download action for an unavailable document", () => {
    const { fixture } = createDetailFixture({
      kind: "not-found",
      document: null,
    });
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain("Document not found");
    expect(content).not.toContain("Download document");
  });
});
