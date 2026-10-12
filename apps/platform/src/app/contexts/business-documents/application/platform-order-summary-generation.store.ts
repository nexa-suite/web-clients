import { computed, inject, Injectable, signal } from "@angular/core";
import { NexaApiError, NexaCommandRetryStore } from "@nexa/api";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformConfirmedSalesOrdersQuery } from "../../sales-commitment/application/public-api";
import type {
  PlatformConfirmedSalesOrder,
  PlatformConfirmedSalesOrderPage,
} from "../../sales-commitment/application/public-api";
import { PlatformBusinessDocumentsApiAdapter } from "./business-documents-api.adapter";
import type {
  PlatformOrderSummaryCandidatesState,
  PlatformOrderSummaryRequestState,
} from "./business-documents.models";

interface ScopedSnapshot<T> {
  readonly lease: PlatformSessionLease;
  readonly value: T;
}

const IDLE_CANDIDATES: PlatformOrderSummaryCandidatesState = {
  kind: "idle",
  page: null,
};
const IDLE_REQUEST: PlatformOrderSummaryRequestState = {
  kind: "idle",
  order: null,
};
const RETRY_PREFIX = "nexa:platform:order-summary-generation:";

@Injectable({ providedIn: "root" })
export class PlatformOrderSummaryGenerationStore {
  private readonly api = inject(PlatformBusinessDocumentsApiAdapter);
  private readonly orders = inject(PlatformConfirmedSalesOrdersQuery);
  private readonly retryCommands = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly candidatesSnapshot =
    signal<ScopedSnapshot<PlatformOrderSummaryCandidatesState> | null>(null);
  private readonly requestSnapshot =
    signal<ScopedSnapshot<PlatformOrderSummaryRequestState> | null>(null);
  private candidatesRevision = 0;
  private requestRevision = 0;

  readonly candidatesState = computed(() => {
    const snapshot = this.candidatesSnapshot();
    return snapshot && this.sessions.isSessionLeaseCurrent(snapshot.lease)
      ? snapshot.value
      : IDLE_CANDIDATES;
  });

  readonly requestState = computed(() => {
    const snapshot = this.requestSnapshot();
    return snapshot && this.sessions.isSessionLeaseCurrent(snapshot.lease)
      ? snapshot.value
      : IDLE_REQUEST;
  });

  readonly canGenerate = computed(() => {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      current.session.membership?.permissions?.includes("document.generate") ===
        true
    );
  });

  readonly canReadSalesOrders = computed(() => {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      current.session.membership?.permissions?.includes("sales.order.read") ===
        true
    );
  });

  async loadCandidates(page = 0): Promise<void> {
    if (!Number.isSafeInteger(page) || page < 0) return;
    const lease = this.sessions.captureSessionLease();
    if (!lease) {
      this.clear();
      return;
    }
    const permissionMessage = this.readPermissionMessage();
    if (permissionMessage) {
      this.candidatesSnapshot.set({
        lease,
        value: {
          kind: "error",
          page: null,
          requestedPage: page,
          errorMessage: permissionMessage,
        },
      });
      return;
    }

    const revision = ++this.candidatesRevision;
    this.candidatesSnapshot.set({
      lease,
      value: { kind: "loading", page: null, requestedPage: page },
    });
    try {
      const result = await this.orders.list(page);
      if (!this.isCurrent(this.candidatesRevision, revision, lease)) return;
      this.candidatesSnapshot.set({
        lease,
        value:
          result.total === 0
            ? { kind: "empty", page: result }
            : { kind: "results", page: result },
      });
    } catch (error) {
      if (!this.isCurrent(this.candidatesRevision, revision, lease)) return;
      this.applySessionError(error, lease);
      this.candidatesSnapshot.set({
        lease,
        value: {
          kind: "error",
          page: null,
          requestedPage: page,
          errorMessage: readErrorMessage(error, "orders"),
        },
      });
    }
  }

  async changeCandidatePage(page: number): Promise<void> {
    const current = this.candidatesState();
    if (current.kind !== "results" && current.kind !== "empty") return;
    if (
      !Number.isSafeInteger(page) ||
      page < 0 ||
      page >= current.page.totalPages ||
      page === current.page.page
    ) {
      return;
    }
    await this.loadCandidates(page);
  }

  async loadOrder(orderId: string): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease) {
      this.clear();
      return;
    }
    const revision = ++this.requestRevision;
    const id = orderId.trim();
    if (!id) {
      this.requestSnapshot.set({
        lease,
        value: {
          kind: "unavailable",
          order: null,
          message: "A Sales Order must be selected from the confirmed order list.",
        },
      });
      return;
    }
    const permissionMessage = this.readPermissionMessage();
    if (permissionMessage) {
      this.requestSnapshot.set({
        lease,
        value: { kind: "error", order: null, orderId: id, message: permissionMessage },
      });
      return;
    }

    this.requestSnapshot.set({
      lease,
      value: { kind: "loading", order: null, orderId: id },
    });
    try {
      const order = await this.orders.get(id);
      if (!this.isCurrent(this.requestRevision, revision, lease)) return;
      if (!order) {
        this.requestSnapshot.set({
          lease,
          value: {
            kind: "unavailable",
            order: null,
            message: "This Sales Order is not available as a confirmed order in the active Platform context.",
          },
        });
        return;
      }
      this.requestSnapshot.set({ lease, value: { kind: "ready", order } });
    } catch (error) {
      if (!this.isCurrent(this.requestRevision, revision, lease)) return;
      this.applySessionError(error, lease);
      this.requestSnapshot.set({
        lease,
        value: {
          kind: "error",
          order: null,
          orderId: id,
          message: readErrorMessage(error, "order"),
        },
      });
    }
  }

  async requestOrderSummaryPdf(): Promise<void> {
    const current = this.requestState();
    const order =
      current.kind === "ready" || current.kind === "error"
        ? current.order
        : null;
    const snapshot = this.requestSnapshot();
    const lease = snapshot?.lease ?? null;
    if (
      !order ||
      !lease ||
      !this.sessions.isSessionLeaseCurrent(lease) ||
      !this.canGenerate() ||
      !this.canReadSalesOrders() ||
      !order.confirmedAt.trim()
    ) {
      return;
    }

    const retryKey = retryStorageKey(lease, order.id);
    let idempotencyKey = this.retryCommands.read(retryKey);
    if (!idempotencyKey) {
      idempotencyKey = createIdempotencyKey();
      this.retryCommands.write(retryKey, idempotencyKey);
    }

    const revision = ++this.requestRevision;
    this.requestSnapshot.set({ lease, value: { kind: "requesting", order } });
    try {
      const request = await this.api.requestOrderSummaryPdf(
        order.id,
        idempotencyKey,
      );
      if (!this.isCurrent(this.requestRevision, revision, lease)) return;
      this.retryCommands.remove(retryKey);
      this.requestSnapshot.set({
        lease,
        value: { kind: "submitted", order, request },
      });
    } catch (error) {
      if (!this.isCurrent(this.requestRevision, revision, lease)) return;
      this.applySessionError(error, lease);
      this.requestSnapshot.set({
        lease,
        value: {
          kind: "error",
          order,
          orderId: order.id,
          message: readErrorMessage(error, "generation"),
        },
      });
    }
  }

  clear(): void {
    ++this.candidatesRevision;
    ++this.requestRevision;
    this.candidatesSnapshot.set(null);
    this.requestSnapshot.set(null);
  }

  private isCurrent(
    revision: number,
    expectedRevision: number,
    lease: PlatformSessionLease,
  ): boolean {
    return (
      revision === expectedRevision && this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private readPermissionMessage(): string | null {
    if (!this.canGenerate()) {
      return "The active Platform membership needs document.generate permission to request an order summary.";
    }
    if (!this.canReadSalesOrders()) {
      return "The active Platform membership needs sales.order.read permission to select a Sales Order.";
    }
    return null;
  }

  private applySessionError(error: unknown, lease: PlatformSessionLease): void {
    if (!(error instanceof NexaApiError)) return;
    if (error.kind === "unauthenticated") {
      this.sessions.expireSessionIfCurrent(lease);
    } else if (error.problem?.code === "ACCESS_CONTEXT_INVALID") {
      this.sessions.invalidateContextIfCurrent(lease);
    }
  }
}

function retryStorageKey(lease: PlatformSessionLease, salesOrderId: string): string {
  return [
    RETRY_PREFIX.slice(0, -1),
    lease.scope.userId,
    lease.scope.tenantId,
    lease.scope.workspaceId,
    lease.scope.membershipId,
    salesOrderId,
  ]
    .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
    .join(":");
}

function createIdempotencyKey(): string {
  const source = globalThis.crypto;
  if (source?.randomUUID) return source.randomUUID();
  const bytes = new Uint8Array(16);
  if (source?.getRandomValues) source.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function readErrorMessage(
  error: unknown,
  action: "orders" | "order" | "generation",
): string {
  if (error instanceof NexaApiError && error.kind === "forbidden") {
    if (action === "generation") {
      return "The API did not authorize this generation request. Check the active membership’s document.generate permission.";
    }
    if (action === "orders") {
      return "The API did not authorize Sales Order access. Check the active membership’s sales.order.read permission.";
    }
    return "This Sales Order is not available in the active Platform context.";
  }
  if (action === "generation") {
    return "The result of the order summary request could not be confirmed. Retry with the saved request identity.";
  }
  if (action === "orders") {
    return "Confirmed Sales Orders could not be loaded. Try again.";
  }
  return "This Sales Order could not be loaded. Try again.";
}
