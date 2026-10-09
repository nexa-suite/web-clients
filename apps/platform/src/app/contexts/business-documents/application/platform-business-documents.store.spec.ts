import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NexaApiError } from "@nexa/api";
import type {
  PlatformSessionLease,
  PlatformSessionState,
} from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformBusinessDocumentsApiAdapter } from "./business-documents-api.adapter";
import type {
  PlatformBusinessDocument,
  PlatformBusinessDocumentPage,
} from "./business-documents.models";
import { PlatformBusinessDocumentDownloadService } from "./platform-business-document-download.service";
import { PlatformBusinessDocumentsStore } from "./platform-business-documents.store";

describe("PlatformBusinessDocumentsStore", () => {
  const firstLease: PlatformSessionLease = {
    epoch: 1,
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-1",
      surface: "PLATFORM",
    },
  };
  const secondLease: PlatformSessionLease = {
    epoch: 2,
    scope: { ...firstLease.scope, membershipId: "membership-2" },
  };
  let activeLease: ReturnType<typeof signal<PlatformSessionLease | null>>;
  let sessionState: ReturnType<typeof signal<PlatformSessionState>>;
  let session: {
    state: ReturnType<typeof signal<PlatformSessionState>>;
    captureSessionLease: () => PlatformSessionLease | null;
    isSessionLeaseCurrent: (lease: PlatformSessionLease) => boolean;
    expireSessionIfCurrent: ReturnType<typeof vi.fn>;
    invalidateContextIfCurrent: ReturnType<typeof vi.fn>;
  };
  let api: {
    list: ReturnType<typeof vi.fn>;
    detail: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };
  let downloader: { download: ReturnType<typeof vi.fn> };
  let store: PlatformBusinessDocumentsStore;

  const document: PlatformBusinessDocument = {
    id: "document-1",
    subjectType: "SALES_ORDER",
    subjectId: "order-1",
    documentType: "INVOICE",
    documentNumber: "INV-2026-001",
    version: 1,
    status: "GENERATED",
    format: "PDF",
    contentType: "application/pdf",
    byteSize: 1_200,
    generatedAt: "2026-10-09T10:00:00Z",
    createdAt: "2026-10-09T10:00:00Z",
    replacementOfDocumentId: null,
    downloadable: true,
  };

  const page = (number = 0): PlatformBusinessDocumentPage => ({
    items: [document],
    page: number,
    size: 25,
    total: 26,
    totalPages: 2,
  });

  beforeEach(() => {
    activeLease = signal<PlatformSessionLease | null>(firstLease);
    sessionState = signal<PlatformSessionState>({
      status: "authenticated",
      session: {
        user: { userId: firstLease.scope.userId },
        tenant: { tenantId: firstLease.scope.tenantId },
        workspace: { workspaceId: firstLease.scope.workspaceId },
        membership: {
          membershipId: firstLease.scope.membershipId,
          permissions: ["document.download"],
        },
        surface: "PLATFORM",
      },
    });
    const isSessionLeaseCurrent = (lease: PlatformSessionLease) =>
      sessionState().status === "authenticated" &&
      activeLease()?.epoch === lease.epoch &&
      activeLease()?.scope.membershipId === lease.scope.membershipId;
    session = {
      state: sessionState,
      captureSessionLease: () =>
        sessionState().status === "authenticated" ? activeLease() : null,
      isSessionLeaseCurrent,
      expireSessionIfCurrent: vi.fn((lease: PlatformSessionLease) => {
        if (!isSessionLeaseCurrent(lease)) return false;
        activeLease.set(null);
        sessionState.set({ status: "unauthenticated" });
        return true;
      }),
      invalidateContextIfCurrent: vi.fn((lease: PlatformSessionLease) => {
        if (!isSessionLeaseCurrent(lease)) return false;
        activeLease.set(null);
        sessionState.set({ status: "error", error: "context invalid" });
        return true;
      }),
    };
    api = { list: vi.fn(), detail: vi.fn(), download: vi.fn() };
    downloader = { download: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PlatformBusinessDocumentsStore,
        { provide: PlatformBusinessDocumentsApiAdapter, useValue: api },
        {
          provide: PlatformBusinessDocumentDownloadService,
          useValue: downloader,
        },
        { provide: PlatformSessionStore, useValue: session },
      ],
    });
    store = TestBed.inject(PlatformBusinessDocumentsStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it("loads paged documents and ignores page changes beyond the server page count", async () => {
    api.list.mockResolvedValueOnce(page(0)).mockResolvedValueOnce(page(1));

    await store.load();
    expect(store.listState()).toMatchObject({
      kind: "results",
      page: { page: 0, totalPages: 2 },
    });

    await store.changePage(2);
    expect(api.list).toHaveBeenCalledTimes(1);
    await store.changePage(1);
    expect(api.list).toHaveBeenLastCalledWith(1);
  });

  it("masks loaded Platform data immediately when its session lease changes", async () => {
    api.list.mockResolvedValueOnce(page());
    await store.load();
    expect(store.listState().kind).toBe("results");

    activeLease.set(secondLease);
    sessionState.set({
      status: "authenticated",
      session: {
        user: { userId: secondLease.scope.userId },
        tenant: { tenantId: secondLease.scope.tenantId },
        workspace: { workspaceId: secondLease.scope.workspaceId },
        membership: { membershipId: secondLease.scope.membershipId },
        surface: "PLATFORM",
      },
    });

    expect(store.listState()).toEqual({ kind: "idle", page: null });
  });

  it("does not expire a replacement session for a late download 401", async () => {
    api.list.mockResolvedValueOnce(page());
    await store.load();

    let rejectDownload!: (error: unknown) => void;
    api.download.mockImplementationOnce(
      () =>
        new Promise<Blob>((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );
    const pending = store.download(document);
    activeLease.set(secondLease);
    sessionState.set({
      status: "authenticated",
      session: {
        user: { userId: secondLease.scope.userId },
        tenant: { tenantId: secondLease.scope.tenantId },
        workspace: { workspaceId: secondLease.scope.workspaceId },
        membership: { membershipId: secondLease.scope.membershipId },
        surface: "PLATFORM",
      },
    });
    rejectDownload(new NexaApiError("unauthenticated", 401, null));
    await pending;

    expect(session.expireSessionIfCurrent).not.toHaveBeenCalled();
    expect(downloader.download).not.toHaveBeenCalled();
    expect(store.downloadState()).toEqual({ kind: "idle" });
  });

  it("downloads the authenticated Blob with a display-derived filename", async () => {
    const content = new Blob(["issued invoice"], { type: "application/pdf" });
    api.list.mockResolvedValueOnce(page());
    api.download.mockResolvedValueOnce(content);
    await store.load();
    expect(store.canDownload()).toBe(true);

    await store.download(document);

    expect(api.download).toHaveBeenCalledWith("document-1");
    expect(downloader.download).toHaveBeenCalledWith(
      content,
      "INV-2026-001-document-1.pdf",
    );
    expect(store.downloadState()).toEqual({ kind: "idle" });
  });

  it("reacts to the active session membership's download permission", () => {
    expect(store.canDownload()).toBe(true);
    sessionState.set({
      status: "authenticated",
      session: {
        user: { userId: firstLease.scope.userId },
        tenant: { tenantId: firstLease.scope.tenantId },
        workspace: { workspaceId: firstLease.scope.workspaceId },
        membership: {
          membershipId: firstLease.scope.membershipId,
          permissions: [],
        },
        surface: "PLATFORM",
      },
    });
    expect(store.canDownload()).toBe(false);
    sessionState.set({
      status: "authenticated",
      session: {
        user: { userId: firstLease.scope.userId },
        tenant: { tenantId: firstLease.scope.tenantId },
        workspace: { workspaceId: firstLease.scope.workspaceId },
        membership: {
          membershipId: firstLease.scope.membershipId,
          permissions: ["document.download"],
        },
        surface: "PLATFORM",
      },
    });
    expect(store.canDownload()).toBe(true);
  });

  it("does not call the API when the active membership lacks download permission", async () => {
    api.list.mockResolvedValueOnce(page());
    await store.load();
    sessionState.set({
      status: "authenticated",
      session: {
        user: { userId: firstLease.scope.userId },
        tenant: { tenantId: firstLease.scope.tenantId },
        workspace: { workspaceId: firstLease.scope.workspaceId },
        membership: {
          membershipId: firstLease.scope.membershipId,
          permissions: [],
        },
        surface: "PLATFORM",
      },
    });

    await store.download(document);

    expect(api.download).not.toHaveBeenCalled();
    expect(downloader.download).not.toHaveBeenCalled();
    expect(store.downloadState()).toMatchObject({
      kind: "error",
      documentId: document.id,
      errorMessage: "Download permission is required for this document.",
    });
  });

  it("shows API download denial without confusing it with document readiness", async () => {
    api.list.mockResolvedValueOnce(page());
    api.download.mockRejectedValueOnce(
      new NexaApiError("forbidden", 403, { code: "FORBIDDEN" }),
    );
    await store.load();

    await store.download(document);

    expect(store.downloadState()).toMatchObject({
      kind: "error",
      errorMessage:
        "The API did not authorize this document download. Check the active membership's document.download permission.",
    });
  });

  it("does not request a download for a document that is not issued", async () => {
    api.list.mockResolvedValueOnce({
      ...page(),
      items: [{ ...document, status: "GENERATING", downloadable: false }],
    });
    await store.load();
    const notIssued = {
      ...document,
      status: "GENERATING",
      downloadable: false,
    };

    await store.download(notIssued);

    expect(api.download).not.toHaveBeenCalled();
    expect(downloader.download).not.toHaveBeenCalled();
    expect(store.downloadState()).toMatchObject({
      kind: "error",
      documentId: document.id,
    });
  });

  it("explains when the active Platform membership lacks document-read access", async () => {
    api.list.mockRejectedValueOnce(
      new NexaApiError("forbidden", 403, { code: "FORBIDDEN" }),
    );

    await store.load();

    expect(store.listState()).toMatchObject({
      kind: "error",
      errorMessage:
        "Your active Platform membership does not have permission to read business documents.",
    });
  });
});
