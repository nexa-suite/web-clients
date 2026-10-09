import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NexaApiError } from "@nexa/api";
import type {
  PortalSessionLease,
  PortalSessionState,
} from "../../tenant-access-governance/application/public-api";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BusinessDocumentsApiAdapter } from "./business-documents-api.adapter";
import type {
  BuyerBusinessDocument,
  BuyerBusinessDocumentPage,
} from "./business-documents.models";
import { BuyerBusinessDocumentDownloadService } from "./business-document-download.service";
import { BuyerBusinessDocumentsStore } from "./buyer-business-documents.store";

describe("BuyerBusinessDocumentsStore", () => {
  const firstLease: PortalSessionLease = {
    epoch: 1,
    scope: {
      userId: "buyer-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-1",
      surface: "PORTAL",
    },
  };
  let activeLease: ReturnType<typeof signal<PortalSessionLease | null>>;
  let sessionState: ReturnType<typeof signal<PortalSessionState>>;
  let session: {
    captureSessionLease: () => PortalSessionLease | null;
    isSessionLeaseCurrent: (lease: PortalSessionLease) => boolean;
    expireSessionIfCurrent: ReturnType<typeof vi.fn>;
    invalidateContextIfCurrent: ReturnType<typeof vi.fn>;
  };
  let api: {
    list: ReturnType<typeof vi.fn>;
    detail: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };
  let downloader: { download: ReturnType<typeof vi.fn> };
  let store: BuyerBusinessDocumentsStore;

  const document: BuyerBusinessDocument = {
    id: "doc-1",
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

  const page = (number: number, totalPages = 2): BuyerBusinessDocumentPage => ({
    items: [document],
    page: number,
    size: 25,
    total: 26,
    totalPages,
  });

  beforeEach(() => {
    activeLease = signal<PortalSessionLease | null>(firstLease);
    sessionState = signal<PortalSessionState>({
      status: "authenticated",
      session: {
        user: { userId: "buyer-1" },
        tenant: { tenantId: "tenant-1" },
        workspace: { workspaceId: "workspace-1" },
        membership: { membershipId: "membership-1" },
        surface: "PORTAL",
      },
    });
    const isSessionLeaseCurrent = (lease: PortalSessionLease) =>
      sessionState().status === "authenticated" &&
      activeLease()?.epoch === lease.epoch;
    session = {
      captureSessionLease: () =>
        sessionState().status === "authenticated" ? activeLease() : null,
      isSessionLeaseCurrent,
      expireSessionIfCurrent: vi.fn((lease: PortalSessionLease) => {
        if (!isSessionLeaseCurrent(lease)) return false;
        activeLease.set(null);
        sessionState.set({ status: "anonymous" });
        return true;
      }),
      invalidateContextIfCurrent: vi.fn((lease: PortalSessionLease) => {
        if (!isSessionLeaseCurrent(lease)) return false;
        activeLease.set(null);
        sessionState.set({ status: "invalidated" });
        return true;
      }),
    };
    api = { list: vi.fn(), detail: vi.fn(), download: vi.fn() };
    downloader = { download: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        BuyerBusinessDocumentsStore,
        { provide: BusinessDocumentsApiAdapter, useValue: api },
        { provide: BuyerBusinessDocumentDownloadService, useValue: downloader },
        { provide: PortalSessionStore, useValue: session },
      ],
    });
    store = TestBed.inject(BuyerBusinessDocumentsStore);
  });

  it("loads server-paged documents and rejects page changes outside the current page range", async () => {
    api.list.mockResolvedValueOnce(page(0)).mockResolvedValueOnce(page(1));

    await store.load();
    expect(store.listState()).toMatchObject({
      kind: "results",
      page: { page: 0 },
    });

    await store.changePage(2);
    expect(api.list).toHaveBeenCalledTimes(1);

    await store.changePage(1);
    expect(api.list).toHaveBeenLastCalledWith(1);
    expect(store.listState()).toMatchObject({
      kind: "results",
      page: { page: 1 },
    });
  });

  it("discards a late list response after the Portal session changes", async () => {
    let finishOldRequest!: (value: BuyerBusinessDocumentPage) => void;
    api.list.mockImplementationOnce(
      () =>
        new Promise<BuyerBusinessDocumentPage>(
          (resolve) => (finishOldRequest = resolve),
        ),
    );
    const pending = store.load();

    activeLease.set({
      ...firstLease,
      epoch: 2,
      scope: { ...firstLease.scope, membershipId: "membership-2" },
    });
    finishOldRequest(page(0));
    await pending;

    expect(store.listState()).toEqual({ kind: "idle", page: null });
  });

  it("expires only the matching session for unauthorized document reads", async () => {
    api.list.mockRejectedValueOnce(
      new NexaApiError("unauthenticated", 401, null),
    );

    await store.load(1);

    expect(session.expireSessionIfCurrent).toHaveBeenCalledWith(firstLease);
    expect(store.listState()).toEqual({ kind: "idle", page: null });
  });

  it("invalidates the active access context when the API reports it is no longer valid", async () => {
    api.detail.mockRejectedValueOnce(
      new NexaApiError("forbidden", 403, { code: "ACCESS_CONTEXT_INVALID" }),
    );

    await store.loadDetail("doc-1");

    expect(session.invalidateContextIfCurrent).toHaveBeenCalledWith(firstLease);
    expect(store.detailState()).toEqual({ kind: "idle", document: null });
  });

  it("separates an unavailable document from a service failure", async () => {
    api.detail.mockRejectedValueOnce(new NexaApiError("not-found", 404, null));

    await store.loadDetail("missing-doc");

    expect(store.detailState()).toEqual({ kind: "not-found", document: null });
  });

  it("downloads generated content through the authenticated adapter and saves the Blob", async () => {
    const blob = new Blob(["issued PDF"], { type: "application/pdf" });
    api.download.mockResolvedValueOnce(blob);

    await store.download(document);

    expect(api.download).toHaveBeenCalledWith("doc-1");
    expect(downloader.download).toHaveBeenCalledWith(
      blob,
      "ORDER_SUMMARY-doc-1.pdf",
    );
    expect(store.downloadState()).toEqual({ kind: "idle" });
  });

  it("does not request a download for documents the API has not issued", async () => {
    await store.download({
      ...document,
      status: "GENERATING",
      downloadable: false,
    });

    expect(api.download).not.toHaveBeenCalled();
    expect(downloader.download).not.toHaveBeenCalled();
    expect(store.downloadState()).toMatchObject({
      kind: "error",
      documentId: "doc-1",
    });
  });
});
