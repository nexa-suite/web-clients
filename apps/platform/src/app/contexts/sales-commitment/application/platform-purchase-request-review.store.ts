import { computed, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { NexaApiError, NexaCommandRetryStore, NexaSalesCommitmentApi } from "@nexa/api";
import type { PurchaseRequestDetail, SalesOrder } from "@nexa/api";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "../../tenant-access-governance/application/public-api";

export type PurchaseRequestReviewAction = "convert" | "reject";
export type PlatformPurchaseRequestReviewStatus = "idle" | "loading" | "ready" | "saving" | "converted" | "rejected" | "error";

export interface PlatformPurchaseRequestReviewState {
  readonly status: PlatformPurchaseRequestReviewStatus;
  readonly request: PurchaseRequestDetail | null;
  readonly order: SalesOrder | null;
  readonly pendingAction: PurchaseRequestReviewAction | null;
  readonly pendingNote: string;
  readonly message: string | null;
}

interface PendingReviewCommand {
  readonly action: PurchaseRequestReviewAction;
  readonly version: number;
  readonly key: string;
  readonly note: string;
}

const EMPTY_STATE: PlatformPurchaseRequestReviewState = {
  status: "idle",
  request: null,
  order: null,
  pendingAction: null,
  pendingNote: "",
  message: null,
};
const PURCHASE_REQUEST_REVIEW_PERMISSION = "sales.purchase_request.review";

/** Persists a Sales decision command across uncertain responses for safe retry. */
@Injectable({ providedIn: "root" })
export class PlatformPurchaseRequestReviewStore {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly retryCommands = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private revision = 0;
  private readonly snapshot = signal<{
    readonly state: PlatformPurchaseRequestReviewState;
    readonly lease: PlatformSessionLease | null;
  }>({ state: EMPTY_STATE, lease: null });

  readonly state = computed(() => {
    const value = this.snapshot();
    return value.lease && this.sessions.isSessionLeaseCurrent(value.lease)
      ? value.state
      : EMPTY_STATE;
  });

  /** Routine Purchase Request decisions belong to the typed Sales review grant. */
  readonly canDecidePurchaseRequest = computed(() => {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      current.session.membership?.permissions?.includes(
        PURCHASE_REQUEST_REVIEW_PERMISSION,
      ) === true
    );
  });

  async load(requestId: string): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.revision;
    if (!requestId.trim() || !lease) {
      this.write({ ...EMPTY_STATE, status: "error", message: "A current Platform context is required to review this request." }, null);
      return;
    }
    this.write({ ...EMPTY_STATE, status: "loading" }, lease);
    try {
      const response = await firstValueFrom(this.api.getPurchaseRequest(requestId));
      if (!this.isCurrent(revision, lease)) return;
      if (!response.body) throw new Error("The API returned an empty purchase request.");
      let pending = this.readCommand(requestId, lease);
      let message: string | null = null;
      if (pending?.action === "convert" && !canReplayConversion(response.body, pending)) {
        this.removeCommand(requestId, lease);
        pending = null;
        message = conversionStateMessage(response.body);
      }
      this.write({
        status: "ready",
        request: response.body,
        order: null,
        pendingAction: pending?.action ?? null,
        pendingNote: pending?.note ?? "",
        message,
      }, lease);
    } catch {
      if (!this.isCurrent(revision, lease)) return;
      this.write({ ...EMPTY_STATE, status: "error", message: "This purchase request could not be loaded. Try again." }, lease);
    }
  }

  async convert(): Promise<void> {
    if (!this.canDecidePurchaseRequest()) return;
    const state = this.state();
    const request = state.request;
    const lease = this.snapshot().lease;
    if (!request || !lease || !this.sessions.isSessionLeaseCurrent(lease)) return;
    const pending = this.readCommand(request.id, lease);
    if (pending && pending.action !== "convert") {
      this.write({ ...state, status: "error", message: "A rejection command is pending. Retry or resolve that saved decision first." }, lease);
      return;
    }
    if (!pending && !canConvert(request.status)) return;
    const command = pending ?? this.newCommand("convert", request.version, "");
    this.persistCommand(request.id, lease, command);
    const revision = ++this.revision;
    this.write({ ...state, status: "saving", pendingAction: "convert", pendingNote: command.note, message: null }, lease);

    if (pending) {
      const reconciliation = await this.reconcilePendingConversion(request.id, lease, revision, command);
      if (!reconciliation || !this.isCurrent(revision, lease)) return;
      if (reconciliation.status !== "current") return;
    }

    try {
      const response = await firstValueFrom(
        this.api.convertPurchaseRequest(request.id, command.version, command.key, command.note || undefined),
      );
      if (!this.isCurrent(revision, lease)) return;
      if (!response.body) throw new Error("The API returned an empty Sales Order.");
      this.removeCommand(request.id, lease);
      this.write({
        status: "converted",
        request: { ...request, status: "CONVERTED" },
        order: response.body,
        pendingAction: null,
        pendingNote: "",
        message: null,
      }, lease);
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease)) return;
      if (error instanceof NexaApiError && (error.kind === "conflict" || error.kind === "precondition")) {
        await this.resolveConversionConflict(request.id, lease, revision, command);
        return;
      }
      this.write({
        ...this.state(),
        status: "error",
        pendingAction: "convert",
        pendingNote: command.note,
        message: "Conversion could not be confirmed. Retry to check the request before replaying the same command.",
      }, lease);
    }
  }

  private async reconcilePendingConversion(
    requestId: string,
    lease: PlatformSessionLease,
    revision: number,
    command: PendingReviewCommand,
  ): Promise<{ readonly status: "current" | "changed" } | null> {
    try {
      const response = await firstValueFrom(this.api.getPurchaseRequest(requestId));
      if (!this.isCurrent(revision, lease)) return null;
      if (!response.body) throw new Error("The API returned an empty Purchase Request.");
      if (!canReplayConversion(response.body, command)) {
        this.removeCommand(requestId, lease);
        this.write({
          status: "ready",
          request: response.body,
          order: null,
          pendingAction: null,
          pendingNote: "",
          message: conversionStateMessage(response.body),
        }, lease);
        return { status: "changed" };
      }
      this.write({
        ...this.state(),
        status: "saving",
        request: response.body,
        pendingAction: "convert",
        pendingNote: command.note,
        message: null,
      }, lease);
      return { status: "current" };
    } catch {
      if (!this.isCurrent(revision, lease)) return null;
      this.write({
        ...this.state(),
        status: "error",
        pendingAction: "convert",
        pendingNote: command.note,
        message: "The current request state could not be checked. Retry to check again before replaying conversion.",
      }, lease);
      return null;
    }
  }

  private async resolveConversionConflict(
    requestId: string,
    lease: PlatformSessionLease,
    revision: number,
    command: PendingReviewCommand,
  ): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.getPurchaseRequest(requestId));
      if (!this.isCurrent(revision, lease)) return;
      if (!response.body) throw new Error("The API returned an empty Purchase Request.");
      this.removeCommand(requestId, lease);
      this.write({
        status: "ready",
        request: response.body,
        order: null,
        pendingAction: null,
        pendingNote: "",
        message: response.body.status === "CONVERTED"
          ? "This request has already been converted. Refresh the Sales inbox to see its current status."
          : response.body.status === "CHANGES_PROPOSED"
            ? conversionStateMessage(response.body)
            : response.body.version !== command.version
              ? "The request changed while conversion was being confirmed. Review its current state before making another decision."
              : "The saved conversion could not be replayed. Review the current request before trying again.",
      }, lease);
    } catch {
      if (!this.isCurrent(revision, lease)) return;
      this.write({
        ...this.state(),
        status: "error",
        pendingAction: "convert",
        pendingNote: command.note,
        message: "Conversion could not be confirmed. Retry to check the current request state.",
      }, lease);
    }
  }

  async reject(reviewNote: string): Promise<void> {
    if (!this.canDecidePurchaseRequest()) return;
    const state = this.state();
    const request = state.request;
    const lease = this.snapshot().lease;
    if (!request || !lease || !this.sessions.isSessionLeaseCurrent(lease)) return;
    const pending = this.readCommand(request.id, lease);
    if (pending && pending.action !== "reject") {
      this.write({ ...state, status: "error", message: "A conversion command is pending. Retry or resolve that saved decision first." }, lease);
      return;
    }
    if (!pending && !canReview(request.status)) return;
    const command = pending ?? this.newCommand("reject", request.version, reviewNote.trim());
    this.persistCommand(request.id, lease, command);
    const revision = ++this.revision;
    this.write({ ...state, status: "saving", pendingAction: "reject", pendingNote: command.note, message: null }, lease);

    if (pending) {
      const reconciliation = await this.reconcilePendingRejection(request.id, lease, revision, command);
      if (!reconciliation || !this.isCurrent(revision, lease)) return;
      if (reconciliation.status !== "current") return;
    }

    try {
      const response = await firstValueFrom(
        this.api.rejectPurchaseRequest(request.id, command.version, command.key, command.note),
      );
      if (!this.isCurrent(revision, lease)) return;
      if (!response.body) throw new Error("The API returned an empty Purchase Request.");
      this.removeCommand(request.id, lease);
      this.write({
        status: "rejected",
        request: response.body,
        order: null,
        pendingAction: null,
        pendingNote: "",
        message: null,
      }, lease);
    } catch {
      if (!this.isCurrent(revision, lease)) return;
      this.write({
        ...this.state(),
        status: "error",
        pendingAction: "reject",
        pendingNote: command.note,
        message: "We couldn’t confirm the result of this rejection. Retry without changing your note.",
      }, lease);
    }
  }

  private async reconcilePendingRejection(
    requestId: string,
    lease: PlatformSessionLease,
    revision: number,
    command: PendingReviewCommand,
  ): Promise<{ readonly status: "current" | "confirmed" | "changed" } | null> {
    try {
      const response = await firstValueFrom(this.api.getPurchaseRequest(requestId));
      if (!this.isCurrent(revision, lease)) return null;
      if (!response.body) throw new Error("The API returned an empty Purchase Request.");

      if (response.body.status === "REJECTED" && response.body.reviewNote === command.note) {
        this.removeCommand(requestId, lease);
        this.write({
          status: "rejected",
          request: response.body,
          order: null,
          pendingAction: null,
          pendingNote: "",
          message: null,
        }, lease);
        return { status: "confirmed" };
      }

      if (response.body.version !== command.version || !canReview(response.body.status)) {
        this.removeCommand(requestId, lease);
        this.write({
          status: "ready",
          request: response.body,
          order: null,
          pendingAction: null,
          pendingNote: "",
          message: "The request changed while the rejection response was uncertain. Review its current state before making another decision.",
        }, lease);
        return { status: "changed" };
      }

      this.write({
        ...this.state(),
        status: "saving",
        request: response.body,
        pendingAction: "reject",
        pendingNote: command.note,
        message: null,
      }, lease);
      return { status: "current" };
    } catch {
      if (!this.isCurrent(revision, lease)) return null;
      this.write({
        ...this.state(),
        status: "error",
        pendingAction: "reject",
        pendingNote: command.note,
        message: "The current request state could not be checked. Retry to check again before replaying the saved rejection.",
      }, lease);
      return null;
    }
  }

  clear(): void {
    this.revision++;
    this.snapshot.set({ state: EMPTY_STATE, lease: null });
  }

  private newCommand(
    action: PurchaseRequestReviewAction,
    version: number,
    note: string,
  ): PendingReviewCommand {
    return { action, version, note, key: createIdempotencyKey(action) };
  }

  private readCommand(requestId: string, lease: PlatformSessionLease): PendingReviewCommand | null {
    const key = commandStorageKey(requestId, lease);
    const raw = this.retryCommands.read(key);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<PendingReviewCommand>;
      if ((value.action === "convert" || value.action === "reject") && Number.isSafeInteger(value.version) && typeof value.key === "string" && typeof value.note === "string") {
        return value as PendingReviewCommand;
      }
    } catch {
      return null;
    }
    return null;
  }

  private persistCommand(requestId: string, lease: PlatformSessionLease, command: PendingReviewCommand): void {
    const key = commandStorageKey(requestId, lease);
    this.retryCommands.write(key, JSON.stringify(command));
  }

  private removeCommand(requestId: string, lease: PlatformSessionLease): void {
    const key = commandStorageKey(requestId, lease);
    this.retryCommands.remove(key);
  }

  private isCurrent(revision: number, lease: PlatformSessionLease): boolean {
    return revision === this.revision && this.sessions.isSessionLeaseCurrent(lease);
  }

  private write(state: PlatformPurchaseRequestReviewState, lease: PlatformSessionLease | null): void {
    this.snapshot.set({ state, lease });
  }
}

function canReview(status: string): boolean {
  return status === "SUBMITTED" || status === "CHANGES_PROPOSED";
}

function canConvert(status: string): boolean {
  return status === "SUBMITTED";
}

function canReplayConversion(request: PurchaseRequestDetail, command: PendingReviewCommand): boolean {
  return request.status === "CONVERTED"
    || (request.status === "SUBMITTED" && request.version === command.version);
}

function conversionStateMessage(request: PurchaseRequestDetail): string {
  if (request.status === "CHANGES_PROPOSED") {
    return "A Buyer must accept proposed changes before Sales can convert this request.";
  }
  if (request.status === "SUBMITTED") {
    return "The request changed while conversion was uncertain. Review its current details before deciding again.";
  }
  return "This request is no longer available for conversion.";
}

function commandStorageKey(requestId: string, lease: PlatformSessionLease): string {
  return ["nexa", "platform", "purchase-request-command", lease.scope.tenantId, lease.scope.workspaceId,
    lease.scope.membershipId, requestId].map((part) => encodeURIComponent(part)).join(":");
}

function createIdempotencyKey(action: PurchaseRequestReviewAction): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `sales-pr-${action}-${random}`;
}
