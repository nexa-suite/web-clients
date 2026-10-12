import { computed, inject, Injectable, signal } from "@angular/core";
import { NexaApiError } from "@nexa/api";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import {
  platformBusinessDocumentDownloadFilename,
  PlatformBusinessDocumentDownloadService,
} from "./platform-business-document-download.service";
import { PlatformBusinessDocumentsApiAdapter } from "./business-documents-api.adapter";
import type {
  PlatformBusinessDocument,
  PlatformBusinessDocumentDetailState,
  PlatformBusinessDocumentDownloadState,
  PlatformBusinessDocumentListState,
} from "./business-documents.models";

interface ScopedSnapshot<T> {
  readonly lease: PlatformSessionLease;
  readonly value: T;
}

const IDLE_LIST: PlatformBusinessDocumentListState = {
  kind: "idle",
  page: null,
};
const IDLE_DETAIL: PlatformBusinessDocumentDetailState = {
  kind: "idle",
  document: null,
};
const IDLE_DOWNLOAD: PlatformBusinessDocumentDownloadState = { kind: "idle" };
const PAGE_SIZE = 25;

@Injectable({ providedIn: "root" })
export class PlatformBusinessDocumentsStore {
  private readonly api = inject(PlatformBusinessDocumentsApiAdapter);
  private readonly downloader = inject(PlatformBusinessDocumentDownloadService);
  private readonly session = inject(PlatformSessionStore);
  private readonly listSnapshot =
    signal<ScopedSnapshot<PlatformBusinessDocumentListState> | null>(null);
  private readonly detailSnapshot =
    signal<ScopedSnapshot<PlatformBusinessDocumentDetailState> | null>(null);
  private readonly downloadSnapshot =
    signal<ScopedSnapshot<PlatformBusinessDocumentDownloadState> | null>(null);
  private listRevision = 0;
  private detailRevision = 0;
  private downloadRevision = 0;

  readonly listState = computed(() => {
    const snapshot = this.listSnapshot();
    return snapshot && this.session.isSessionLeaseCurrent(snapshot.lease)
      ? snapshot.value
      : IDLE_LIST;
  });

  readonly detailState = computed(() => {
    const snapshot = this.detailSnapshot();
    return snapshot && this.session.isSessionLeaseCurrent(snapshot.lease)
      ? snapshot.value
      : IDLE_DETAIL;
  });

  readonly downloadState = computed(() => {
    const snapshot = this.downloadSnapshot();
    return snapshot && this.session.isSessionLeaseCurrent(snapshot.lease)
      ? snapshot.value
      : IDLE_DOWNLOAD;
  });

  readonly canDownload = computed(() => {
    const current = this.session.state();
    return (
      current.status === "authenticated" &&
      current.session.membership?.permissions?.includes("document.download") ===
        true
    );
  });

  readonly canGenerate = computed(() => {
    const current = this.session.state();
    return (
      current.status === "authenticated" &&
      current.session.membership?.permissions?.includes("document.generate") ===
        true
    );
  });

  async load(page = 0): Promise<void> {
    if (!Number.isSafeInteger(page) || page < 0) return;
    const lease = this.session.captureSessionLease();
    if (!lease) {
      this.clear();
      return;
    }

    const revision = ++this.listRevision;
    this.listSnapshot.set({
      lease,
      value: { kind: "loading", page: null, requestedPage: page },
    });
    try {
      const result = await this.api.list(page);
      if (!this.isCurrent(this.listRevision, revision, lease)) return;
      this.listSnapshot.set({
        lease,
        value:
          result.items.length === 0
            ? { kind: "empty", page: result }
            : { kind: "results", page: result },
      });
    } catch (error) {
      if (!this.isCurrent(this.listRevision, revision, lease)) return;
      this.applySessionError(error, lease);
      this.listSnapshot.set({
        lease,
        value: {
          kind: "error",
          page: null,
          requestedPage: page,
          errorMessage: readErrorMessage(error, "list"),
        },
      });
    }
  }

  async changePage(page: number): Promise<void> {
    const current = this.listState();
    if (current.kind !== "results" && current.kind !== "empty") {
      return;
    }
    if (
      !Number.isSafeInteger(page) ||
      page < 0 ||
      page >= current.page.totalPages ||
      page === current.page.page
    ) {
      return;
    }
    await this.load(page);
  }

  async loadDetail(documentId: string): Promise<void> {
    const lease = this.session.captureSessionLease();
    if (!lease) {
      this.clear();
      return;
    }
    const revision = ++this.detailRevision;
    const id = documentId.trim();
    if (!id) {
      this.detailSnapshot.set({
        lease,
        value: { kind: "not-found", document: null },
      });
      return;
    }

    this.detailSnapshot.set({
      lease,
      value: { kind: "loading", document: null, documentId: id },
    });
    try {
      const document = await this.api.detail(id);
      if (!this.isCurrent(this.detailRevision, revision, lease)) return;
      this.detailSnapshot.set({ lease, value: { kind: "loaded", document } });
    } catch (error) {
      if (!this.isCurrent(this.detailRevision, revision, lease)) return;
      this.applySessionError(error, lease);
      this.detailSnapshot.set({
        lease,
        value:
          error instanceof NexaApiError && error.kind === "not-found"
            ? { kind: "not-found", document: null }
            : {
                kind: "error",
                document: null,
                documentId: id,
                errorMessage: readErrorMessage(error, "detail"),
              },
      });
    }
  }

  async download(document: PlatformBusinessDocument): Promise<void> {
    const lease = this.session.captureSessionLease();
    if (!lease) {
      this.clear();
      return;
    }

    const currentDocument = this.findCurrentDocument(document.id);
    const revision = ++this.downloadRevision;
    if (!currentDocument || !currentDocument.downloadable) {
      this.downloadSnapshot.set({
        lease,
        value: {
          kind: "error",
          documentId: document.id,
          errorMessage: "This document is not available to download.",
        },
      });
      return;
    }
    if (!this.canDownload()) {
      this.downloadSnapshot.set({
        lease,
        value: {
          kind: "error",
          documentId: currentDocument.id,
          errorMessage: "Download permission is required for this document.",
        },
      });
      return;
    }

    this.downloadSnapshot.set({
      lease,
      value: { kind: "loading", documentId: currentDocument.id },
    });
    try {
      const content = await this.api.download(currentDocument.id);
      if (!this.isCurrent(this.downloadRevision, revision, lease)) return;
      this.downloader.download(
        content,
        platformBusinessDocumentDownloadFilename(currentDocument),
      );
      this.downloadSnapshot.set({ lease, value: IDLE_DOWNLOAD });
    } catch (error) {
      if (!this.isCurrent(this.downloadRevision, revision, lease)) return;
      this.applySessionError(error, lease);
      this.downloadSnapshot.set({
        lease,
        value: {
          kind: "error",
          documentId: currentDocument.id,
          errorMessage: readErrorMessage(error, "download"),
        },
      });
    }
  }

  clear(): void {
    ++this.listRevision;
    ++this.detailRevision;
    ++this.downloadRevision;
    this.listSnapshot.set(null);
    this.detailSnapshot.set(null);
    this.downloadSnapshot.set(null);
  }

  private findCurrentDocument(id: string): PlatformBusinessDocument | null {
    const detail = this.detailState();
    if (detail.kind === "loaded" && detail.document.id === id) {
      return detail.document;
    }
    const list = this.listState();
    if (list.kind === "results" || list.kind === "empty") {
      return list.page.items.find((item) => item.id === id) ?? null;
    }
    return null;
  }

  private isCurrent(
    revision: number,
    expectedRevision: number,
    lease: PlatformSessionLease,
  ): boolean {
    return (
      revision === expectedRevision && this.session.isSessionLeaseCurrent(lease)
    );
  }

  private applySessionError(error: unknown, lease: PlatformSessionLease): void {
    if (!(error instanceof NexaApiError)) return;
    if (error.kind === "unauthenticated") {
      this.session.expireSessionIfCurrent(lease);
    } else if (error.problem?.code === "ACCESS_CONTEXT_INVALID") {
      this.session.invalidateContextIfCurrent(lease);
    }
  }
}

function readErrorMessage(
  error: unknown,
  action: "list" | "detail" | "download",
): string {
  if (error instanceof NexaApiError && error.kind === "forbidden") {
    if (action === "download") {
      return "The API did not authorize this document download. Check the active membership's document.download permission.";
    }
    return "Your active Platform membership does not have permission to read business documents.";
  }
  if (action === "list")
    return "Business documents could not be loaded. Try again.";
  if (action === "download")
    return "This business document could not be downloaded. Try again.";
  return "This business document could not be opened. Try again.";
}
