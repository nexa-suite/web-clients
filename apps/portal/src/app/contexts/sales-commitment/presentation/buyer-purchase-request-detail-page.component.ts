import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NexaApiError, NexaCommandRetryStore } from "@nexa/api";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { NexaSalesCommitmentApi } from "@nexa/api";
import type { MaterialChangeProposal, PurchaseRequestDetail, PurchaseRequestEvent } from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import { distinctUntilChanged, firstValueFrom, map } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import {
  canAccessPortalFeature,
  PORTAL_ACCESS_RULES,
} from "../../../core/portal-access-policy";

type PurchaseRequestDetailState =
  | { readonly status: "loading"; readonly request: null; readonly etag: null; readonly timeline: null; readonly materialChange: null; readonly message: null }
  | {
      readonly status: "ready";
      readonly request: PurchaseRequestDetail;
      readonly etag: string | null;
      readonly timeline: PurchaseRequestTimelineState;
      readonly materialChange: PurchaseRequestMaterialChangeState;
      readonly message: null;
    }
  | { readonly status: "error"; readonly request: null; readonly etag: null; readonly timeline: null; readonly materialChange: null; readonly message: string };

type PurchaseRequestTimelineState =
  | { readonly status: "ready"; readonly events: readonly PurchaseRequestEvent[] }
  | { readonly status: "empty" }
  | { readonly status: "error" };

type PurchaseRequestMaterialChangeState =
  | { readonly status: "not-applicable" }
  | { readonly status: "ready"; readonly proposal: MaterialChangeProposal }
  | { readonly status: "error" };

type PurchaseRequestCommandAction = "accept-material-change" | "reject-material-change" | "withdraw";
type PurchaseRequestCommandState =
  | { readonly status: "idle" }
  | { readonly status: "confirming"; readonly action: PurchaseRequestCommandAction }
  | { readonly status: "submitting"; readonly action: PurchaseRequestCommandAction }
  | { readonly status: "error" | "conflict"; readonly action: PurchaseRequestCommandAction; readonly message: string }
  | { readonly status: "success"; readonly message: string };

interface StoredBuyerPurchaseRequestCommand {
  readonly action: PurchaseRequestCommandAction;
  readonly etag: string;
  readonly fingerprint: string;
  readonly idempotencyKey: string;
  readonly proposalId: string | null;
  readonly requestVersion: number;
}

interface ActiveBuyerPurchaseRequestCommand {
  readonly lease: PortalLease;
  readonly requestId: string;
  readonly storageKey: string;
  readonly command: StoredBuyerPurchaseRequestCommand;
}

type PortalLease = NonNullable<ReturnType<PortalSessionStore["captureSessionLease"]>>;
const LOADING_STATE: PurchaseRequestDetailState = { status: "loading", request: null, etag: null, timeline: null, materialChange: null, message: null };
const STALE_CONTEXT_STATE: PurchaseRequestDetailState = { status: "error", request: null, etag: null, timeline: null, materialChange: null, message: "Your Buyer context changed. Refresh after signing in to continue." };

@Component({
  selector: "portal-buyer-purchase-request-detail-page",
  standalone: true,
  imports: [DatePipe, NexaButton, NexaSurface, RouterLink],
  templateUrl: "./buyer-purchase-request-detail-page.component.html",
  styleUrl: "./buyer-sales-commitment-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerPurchaseRequestDetailPageComponent implements OnInit {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly retryCommands = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PortalSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly canReadRequests = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" && canAccessPortalFeature(
      current.session,
      PORTAL_ACCESS_RULES.purchaseRequests,
    );
  });
  protected readonly canReadOrders = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" && canAccessPortalFeature(
      current.session,
      PORTAL_ACCESS_RULES.orders,
    );
  });
  protected readonly canWriteRequests = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" && canAccessPortalFeature(
      current.session,
      PORTAL_ACCESS_RULES.purchaseRequestWrite,
    );
  });
  private revision = 0;
  private currentRequestId: string | null = null;
  private readonly snapshot = signal<{ readonly state: PurchaseRequestDetailState; readonly lease: PortalLease | null }>({ state: LOADING_STATE, lease: null });
  protected readonly commandState = signal<PurchaseRequestCommandState>({ status: "idle" });
  protected readonly canStartCommand = computed(() => {
    const status = this.commandState().status;
    return status === "idle" || status === "success";
  });
  private readonly activeCommand = signal<ActiveBuyerPurchaseRequestCommand | null>(null);
  protected readonly state = computed(() => {
    const current = this.snapshot();
    if (!current.lease) return current.state.status === "error" ? current.state : LOADING_STATE;
    return this.sessions.isSessionLeaseCurrent(current.lease) ? current.state : STALE_CONTEXT_STATE;
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(
      map((params) => params.get("requestId")),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((requestId) => {
      this.currentRequestId = requestId;
      this.revision += 1;
      this.activeCommand.set(null);
      this.commandState.set({ status: "idle" });
      this.write(LOADING_STATE, null);
      void this.load(requestId);
    });
  }
  protected async refresh(): Promise<void> { await this.load(); }

  protected async reloadAfterCommand(): Promise<void> {
    this.commandState.set({ status: "idle" });
    this.activeCommand.set(null);
    await this.load();
  }

  protected askForConfirmation(action: PurchaseRequestCommandAction): void {
    if (!this.canStartCommand() || !this.isActionAvailable(action)) return;
    this.commandState.set({ status: "confirming", action });
  }

  protected cancelConfirmation(): void {
    if (this.commandState().status === "confirming") this.commandState.set({ status: "idle" });
  }

  protected async executeConfirmedAction(): Promise<void> {
    const commandState = this.commandState();
    if (commandState.status !== "confirming") return;
    await this.executeAction(commandState.action);
  }

  protected async retryAction(): Promise<void> {
    const commandState = this.commandState();
    if (commandState.status !== "error") return;
    await this.executeAction(commandState.action);
  }

  protected actionConfirmation(action: PurchaseRequestCommandAction): string {
    switch (action) {
      case "accept-material-change": return "Accepting these terms replaces the current request terms after the API revalidates them.";
      case "reject-material-change": return "Rejecting this proposal keeps the current request terms and returns the request to Submitted.";
      case "withdraw": return "Withdrawing ends this Purchase Request and releases its active commercial protections.";
    }
  }

  protected commandErrorMessage(action: PurchaseRequestCommandAction): string {
    return action === "withdraw"
      ? "We could not confirm whether the request was withdrawn. Reload its current status before taking another action."
      : "We could not confirm this decision. Retry uses the same request version and idempotency key, or reload to check the current status.";
  }

  private async load(requestId = this.currentRequestId): Promise<void> {
    const id = requestId;
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.revision;
    if (!id || !lease) {
      this.write({ status: "error", request: null, etag: null, timeline: null, materialChange: null, message: "This request is unavailable in the current Buyer context." }, null);
      return;
    }
    this.write(LOADING_STATE, lease);
    try {
      const [requestResult, eventsResult] = await Promise.allSettled([
        firstValueFrom(this.api.getPurchaseRequest(id)),
        firstValueFrom(this.api.listPurchaseRequestEvents(id)),
      ] as const);
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      if (requestResult.status === "rejected") throw requestResult.reason;
      if (!requestResult.value.body) throw new Error("Empty purchase request response.");

      const timeline: PurchaseRequestTimelineState = eventsResult.status === "rejected"
        ? { status: "error" }
        : eventsResult.value.length === 0
          ? { status: "empty" }
          : { status: "ready", events: chronologicalEvents(eventsResult.value) };
      const request = requestResult.value.body;
      if (request.id !== id) throw new Error("Purchase request response did not match the requested resource.");
      let materialChange: PurchaseRequestMaterialChangeState = { status: "not-applicable" };
      if (request.status === "CHANGES_PROPOSED") {
        try {
          const proposal = await firstValueFrom(this.api.getCurrentMaterialChange(id));
          if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
          materialChange = proposal.status === "PROPOSED" && proposal.requestVersion === request.version
            ? { status: "ready", proposal }
            : { status: "error" };
        } catch {
          if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
          materialChange = { status: "error" };
        }
      }
      this.write({ status: "ready", request, etag: requestResult.value.headers.get("ETag"), timeline, materialChange, message: null }, lease);
    } catch {
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      this.write({ status: "error", request: null, etag: null, timeline: null, materialChange: null, message: "This purchase request could not be loaded. Try again." }, lease);
    }
  }

  private async executeAction(action: PurchaseRequestCommandAction): Promise<void> {
    const current = this.state();
    const active = this.activeCommand();
    const lease = this.snapshot().lease;
    if (this.commandState().status === "submitting") return;
    if (current.status !== "ready" || !lease || !this.sessions.isSessionLeaseCurrent(lease) || !this.canWriteRequests()) return;

    const request = current.request;
    if (this.currentRequestId !== request.id) return;
    const proposal = current.materialChange.status === "ready" ? current.materialChange.proposal : null;
    const retryingSameCommand = active?.requestId === request.id && active.command.action === action &&
      this.sessions.isSessionLeaseCurrent(active.lease);
    if (!retryingSameCommand && !this.isActionAvailable(action)) return;
    const proposalId = action === "withdraw" ? null : proposal?.id ?? null;
    if (action !== "withdraw" && !proposalId) return;
    if (!retryingSameCommand && !current.etag) {
      this.commandState.set({ status: "conflict", action, message: "This request has no current ETag. Reload before making a decision." });
      return;
    }

    this.commandState.set({ status: "submitting", action });
    let storageKey: string | null = null;
    try {
      let command: StoredBuyerPurchaseRequestCommand;
      if (retryingSameCommand && active) {
        storageKey = active.storageKey;
        command = active.command;
      } else {
        storageKey = await buyerPurchaseRequestCommandStorageKey(lease, request.id, action, proposalId);
        if (!this.isCurrentRequest(request.id, lease)) return;
        const etag = current.etag;
        if (!etag) {
          this.commandState.set({ status: "conflict", action, message: "This request has no current ETag. Reload before making a decision." });
          return;
        }
        const fingerprint = await sha256([
          action,
          request.id,
          proposalId ?? "",
          String(request.version),
          etag,
        ].join("\n"));
        if (!this.isCurrentRequest(request.id, lease)) return;
        const storedCommand = readStoredBuyerCommand(this.retryCommands.read(storageKey));
        if (storedCommand && storedCommand.action === action && storedCommand.etag === etag &&
          storedCommand.requestVersion === request.version && storedCommand.proposalId === proposalId &&
          storedCommand.fingerprint === fingerprint) {
          command = storedCommand;
        } else {
          this.retryCommands.remove(storageKey);
          command = {
            action,
            etag,
            fingerprint,
            idempotencyKey: createBuyerPurchaseRequestIdempotencyKey(),
            proposalId,
            requestVersion: request.version,
          };
          this.retryCommands.write(storageKey, JSON.stringify(command));
        }
        this.activeCommand.set({ lease, requestId: request.id, storageKey, command });
      }

      if (!this.isCurrentRequest(request.id, lease)) return;
      const response = await firstValueFrom(this.sendCommand(request.id, command));
      if (!this.isCurrentRequest(request.id, lease)) return;
      if (!response.body || response.body.id !== request.id || !response.headers.get("ETag")) {
        throw new NexaApiError("unknown", null, null);
      }
      this.retryCommands.remove(storageKey);
      this.activeCommand.set(null);
      this.commandState.set({ status: "success", message: successMessage(action) });
      await this.load();
    } catch (error: unknown) {
      if (!this.isCurrentRequest(request.id, lease)) return;
      this.handleSessionFailure(error, lease);
      if (error instanceof NexaApiError && (error.kind === "conflict" || error.kind === "precondition")) {
        if (storageKey) this.retryCommands.remove(storageKey);
        this.activeCommand.set(null);
        this.commandState.set({ status: "conflict", action, message: "The request or proposal changed before this decision was applied. Reload the current request before continuing." });
      } else {
        this.commandState.set({ status: "error", action, message: this.commandErrorMessage(action) });
      }
    }
  }

  private sendCommand(requestId: string, command: StoredBuyerPurchaseRequestCommand) {
    switch (command.action) {
      case "accept-material-change": {
        if (!command.proposalId) throw new Error("The active proposal is required for acceptance.");
        return this.api.acceptPurchaseRequestMaterialChange(requestId, command.proposalId, command.etag, command.idempotencyKey);
      }
      case "reject-material-change": {
        if (!command.proposalId) throw new Error("The active proposal is required for rejection.");
        return this.api.rejectPurchaseRequestMaterialChange(requestId, command.proposalId, command.etag, command.idempotencyKey);
      }
      case "withdraw":
        return this.api.withdrawPurchaseRequest(requestId, command.etag, command.idempotencyKey);
    }
  }

  private isActionAvailable(action: PurchaseRequestCommandAction): boolean {
    const current = this.state();
    if (current.status !== "ready" || !this.canWriteRequests()) return false;
    if (action === "withdraw") {
      return current.request.status === "SUBMITTED" || current.request.status === "CHANGES_PROPOSED";
    }
    return current.request.status === "CHANGES_PROPOSED" && current.materialChange.status === "ready" &&
      current.materialChange.proposal.status === "PROPOSED" && current.materialChange.proposal.requestVersion === current.request.version;
  }

  private handleSessionFailure(error: unknown, lease: PortalLease): void {
    if (error instanceof NexaApiError && error.kind === "unauthenticated") {
      this.sessions.expireSessionIfCurrent(lease);
    } else if (error instanceof NexaApiError && error.kind === "forbidden" &&
      error.problem?.code === "ACCESS_CONTEXT_INVALID") {
      this.sessions.invalidateContextIfCurrent(lease);
    }
  }

  private isCurrentRequest(requestId: string, lease: PortalLease): boolean {
    return this.currentRequestId === requestId && this.sessions.isSessionLeaseCurrent(lease);
  }

  private write(state: PurchaseRequestDetailState, lease: PortalLease | null): void {
    this.snapshot.set({ state, lease });
  }
}

function readStoredBuyerCommand(value: string | null): StoredBuyerPurchaseRequestCommand | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredBuyerPurchaseRequestCommand>;
    if ((parsed.action !== "accept-material-change" && parsed.action !== "reject-material-change" && parsed.action !== "withdraw") ||
      typeof parsed.etag !== "string" || typeof parsed.fingerprint !== "string" || typeof parsed.idempotencyKey !== "string" ||
      !Number.isSafeInteger(parsed.requestVersion) || typeof parsed.requestVersion !== "number" ||
      (parsed.proposalId !== null && typeof parsed.proposalId !== "string")) return null;
    return parsed as StoredBuyerPurchaseRequestCommand;
  } catch {
    return null;
  }
}

async function buyerPurchaseRequestCommandStorageKey(
  lease: PortalLease,
  requestId: string,
  action: PurchaseRequestCommandAction,
  proposalId: string | null,
): Promise<string> {
  const digest = await sha256([requestId, action, proposalId ?? ""].join("\n"));
  return [
    "nexa",
    "buyer",
    "purchase-request-command",
    lease.scope.tenantId,
    lease.scope.workspaceId,
    lease.scope.membershipId,
    digest,
  ].map((part) => encodeURIComponent(part)).join(":");
}

async function sha256(value: string): Promise<string> {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) throw new Error("Secure command fingerprinting is unavailable.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createBuyerPurchaseRequestIdempotencyKey(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID !== "function") throw new Error("Secure command key generation is unavailable.");
  return `buyer-pr-command-${crypto.randomUUID()}`;
}

function successMessage(action: PurchaseRequestCommandAction): string {
  switch (action) {
    case "accept-material-change": return "The material changes were accepted. The current request has been refreshed.";
    case "reject-material-change": return "The material change proposal was rejected. The current request has been refreshed.";
    case "withdraw": return "The Purchase Request was withdrawn.";
  }
}

function chronologicalEvents(events: readonly PurchaseRequestEvent[]): readonly PurchaseRequestEvent[] {
  return [...events].sort((left, right) => {
    const timeDifference = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
    return left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId);
  });
}
