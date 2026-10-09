import { computed, inject, Injectable, signal } from "@angular/core";
import { NexaApiError } from "@nexa/api";
import type { PortalSessionLease } from "../../tenant-access-governance/application/public-api";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import {
  businessDocumentDownloadFilename,
  BuyerBusinessDocumentDownloadService,
} from "./business-document-download.service";
import { BusinessDocumentsApiAdapter } from "./business-documents-api.adapter";
import type {
  BusinessDocumentDetailState,
  BusinessDocumentDownloadState,
  BusinessDocumentListState,
  BuyerBusinessDocument,
} from "./business-documents.models";

interface ScopedSnapshot<T> {
  readonly lease: PortalSessionLease;
  readonly value: T;
}

const IDLE_LIST: BusinessDocumentListState = { kind: "idle", page: null };
const IDLE_DETAIL: BusinessDocumentDetailState = {
  kind: "idle",
  document: null,
};
const IDLE_DOWNLOAD: BusinessDocumentDownloadState = { kind: "idle" };

@Injectable({ providedIn: "root" })
export class BuyerBusinessDocumentsStore {
  private readonly api = inject(BusinessDocumentsApiAdapter);
  private readonly downloader = inject(BuyerBusinessDocumentDownloadService);
  private readonly session = inject(PortalSessionStore);
  private readonly listSnapshot =
    signal<ScopedSnapshot<BusinessDocumentListState> | null>(null);
  private readonly detailSnapshot =
    signal<ScopedSnapshot<BusinessDocumentDetailState> | null>(null);
  private readonly downloadSnapshot =
    signal<ScopedSnapshot<BusinessDocumentDownloadState> | null>(null);
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
      const value: BusinessDocumentListState =
        result.items.length === 0
          ? { kind: "empty", page: result }
          : { kind: "results", page: result };
      this.listSnapshot.set({
        lease,
        value,
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
          errorMessage: "Business documents could not be loaded. Try again.",
        },
      });
    }
  }

  async changePage(page: number): Promise<void> {
    const current = this.listState();
    if (
      !current.page ||
      !Number.isSafeInteger(page) ||
      page < 0 ||
      page >= current.page.totalPages
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
      if (error instanceof NexaApiError && error.kind === "not-found") {
        this.detailSnapshot.set({
          lease,
          value: { kind: "not-found", document: null },
        });
        return;
      }
      this.detailSnapshot.set({
        lease,
        value: {
          kind: "error",
          document: null,
          documentId: id,
          errorMessage:
            "This business document could not be opened. Try again.",
        },
      });
    }
  }

  async download(document: BuyerBusinessDocument): Promise<void> {
    const lease = this.session.captureSessionLease();
    if (!lease) {
      this.clear();
      return;
    }
    const revision = ++this.downloadRevision;
    if (!document.downloadable) {
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

    this.downloadSnapshot.set({
      lease,
      value: { kind: "loading", documentId: document.id },
    });
    try {
      const content = await this.api.download(document.id);
      if (!this.isCurrent(this.downloadRevision, revision, lease)) return;
      this.downloader.download(
        content,
        businessDocumentDownloadFilename(document),
      );
      this.downloadSnapshot.set({ lease, value: IDLE_DOWNLOAD });
    } catch (error) {
      if (!this.isCurrent(this.downloadRevision, revision, lease)) return;
      this.applySessionError(error, lease);
      this.downloadSnapshot.set({
        lease,
        value: {
          kind: "error",
          documentId: document.id,
          errorMessage:
            "The business document could not be downloaded. Try again.",
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

  private isCurrent(
    revision: number,
    expectedRevision: number,
    lease: PortalSessionLease,
  ): boolean {
    return (
      revision === expectedRevision && this.session.isSessionLeaseCurrent(lease)
    );
  }

  private applySessionError(error: unknown, lease: PortalSessionLease): void {
    if (!(error instanceof NexaApiError)) return;
    if (error.kind === "unauthenticated") {
      this.session.expireSessionIfCurrent(lease);
    } else if (error.problem?.code === "ACCESS_CONTEXT_INVALID") {
      this.session.invalidateContextIfCurrent(lease);
    }
  }
}
