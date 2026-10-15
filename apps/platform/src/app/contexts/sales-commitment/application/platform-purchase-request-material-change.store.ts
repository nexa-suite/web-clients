import { computed, effect, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import {
  NexaApiError,
  NexaCommandRetryStore,
  NexaSalesCommitmentApi,
  type MaterialChangeProposal,
  type ProposeMaterialChangeRequest,
  type PurchaseRequestDetail,
} from "@nexa/api";
import {
  canAccessPlatformFeature,
  PLATFORM_ACCESS_RULES,
} from "../../../core/platform-access-policy";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "../../tenant-access-governance/application/public-api";

export type PlatformMaterialChangeStatus =
  | "idle"
  | "loading"
  | "ready"
  | "saving"
  | "error";

export interface MaterialChangeDraftLine {
  readonly rowKey: string;
  readonly catalogItemId: string;
  readonly quantity: string;
  readonly unit: string;
  readonly notes: string;
}

export interface MaterialChangeDraft {
  readonly reason: string;
  readonly priority: string;
  readonly requestedDeliveryDate: string;
  readonly deliveryProfileSnapshot: string;
  readonly paymentOption: string;
  readonly comment: string;
  readonly lines: readonly MaterialChangeDraftLine[];
}

export interface PlatformPurchaseRequestMaterialChangeState {
  readonly status: PlatformMaterialChangeStatus;
  readonly request: PurchaseRequestDetail | null;
  readonly etag: string | null;
  readonly currentProposal: MaterialChangeProposal | null;
  readonly history: readonly MaterialChangeProposal[];
  readonly draft: MaterialChangeDraft | null;
  readonly pending: boolean;
  readonly pendingPayloadAvailable: boolean;
  readonly message: string | null;
  readonly notice: string | null;
}

interface PendingMaterialChangeCommand {
  readonly etag: string;
  readonly idempotencyKey: string;
  readonly requestVersion: number;
  readonly fingerprint: string;
  readonly request: ProposeMaterialChangeRequest;
}

interface PersistedMaterialChangeCommand {
  readonly etag: string;
  readonly idempotencyKey: string;
  readonly requestVersion: number;
  readonly fingerprint: string;
}

const EMPTY_STATE: PlatformPurchaseRequestMaterialChangeState = {
  status: "idle",
  request: null,
  etag: null,
  currentProposal: null,
  history: [],
  draft: null,
  pending: false,
  pendingPayloadAvailable: false,
  message: null,
  notice: null,
};

const MATERIAL_CHANGE_PERMISSION = "sales.purchase_request.review";

/** Runs Sales material-change proposals through the authoritative Sales Commitment API. */
@Injectable({ providedIn: "root" })
export class PlatformPurchaseRequestMaterialChangeStore {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly retryCommands = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly pendingPayloads = new Map<
    string,
    PendingMaterialChangeCommand
  >();
  private readonly pendingPayloadLeases = new Map<
    string,
    PlatformSessionLease
  >();
  private readonly proposalBusy = signal(false);
  private activeProposalToken: symbol | null = null;
  private activeProposalLease: PlatformSessionLease | null = null;
  private revision = 0;
  private readonly snapshot = signal<{
    readonly state: PlatformPurchaseRequestMaterialChangeState;
    readonly lease: PlatformSessionLease | null;
  }>({ state: EMPTY_STATE, lease: null });

  readonly busy = this.proposalBusy.asReadonly();

  constructor() {
    effect(() => {
      this.sessions.state();
      const activeLease = this.sessions.captureSessionLease();
      const current = this.snapshot();
      if (
        current.lease &&
        (!activeLease || !this.sessions.isSessionLeaseCurrent(current.lease))
      ) {
        this.snapshot.set({ state: EMPTY_STATE, lease: null });
      }
      for (const [storageKey, lease] of this.pendingPayloadLeases) {
        if (!activeLease || !this.sessions.isSessionLeaseCurrent(lease)) {
          this.clearInMemoryPayload(storageKey);
        }
      }
      if (
        this.activeProposalLease &&
        (!activeLease ||
          !this.sessions.isSessionLeaseCurrent(this.activeProposalLease))
      ) {
        this.activeProposalToken = null;
        this.activeProposalLease = null;
        this.proposalBusy.set(false);
      }
    });
  }

  readonly state = computed(() => {
    const value = this.snapshot();
    return value.lease && this.sessions.isSessionLeaseCurrent(value.lease)
      ? value.state
      : EMPTY_STATE;
  });

  readonly canPropose = computed(() => {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      current.session.membership?.permissions?.includes(
        MATERIAL_CHANGE_PERMISSION,
      ) === true &&
      canAccessPlatformFeature(
        current.session,
        PLATFORM_ACCESS_RULES.purchaseRequestMaterialChanges,
      )
    );
  });

  async load(requestId: string): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.revision;
    if (!requestId.trim() || !lease) {
      this.write(
        {
          ...EMPTY_STATE,
          status: "error",
          message:
            "A current Platform context is required to propose request changes.",
        },
        null,
      );
      return;
    }

    this.write({ ...EMPTY_STATE, status: "loading" }, lease);
    try {
      const response = await firstValueFrom(
        this.api.getPurchaseRequest(requestId),
      );
      if (!this.isCurrent(revision, lease)) return;
      if (!response.body)
        throw new Error("The API returned an empty Purchase Request.");
      if (response.body.id !== requestId)
        throw new Error("The API returned a different Purchase Request.");

      const request = response.body;
      const etag = response.headers.get("ETag");
      let history: readonly MaterialChangeProposal[] = [];
      let currentProposal: MaterialChangeProposal | null = null;
      let notice: string | null = null;

      try {
        const loadedHistory = await firstValueFrom(
          this.api.listMaterialChangeHistory(requestId),
        );
        if (!this.isCurrent(revision, lease)) return;
        history = loadedHistory.filter(
          (proposal) => proposal.purchaseRequestId === requestId,
        );
        if (history.length !== loadedHistory.length) {
          notice =
            "Some material-change history entries could not be verified for this request.";
        }
      } catch (error: unknown) {
        if (!this.isCurrent(revision, lease)) return;
        if (this.failClosedForAuthorization(error, lease)) return;
        notice = "Material-change history could not be loaded.";
      }
      if (!this.isCurrent(revision, lease)) return;

      if (request.status === "CHANGES_PROPOSED") {
        try {
          const proposal = await firstValueFrom(
            this.api.getCurrentMaterialChange(requestId),
          );
          if (!this.isCurrent(revision, lease)) return;
          if (proposal.purchaseRequestId === requestId) {
            currentProposal = proposal;
          } else {
            notice = joinNotice(
              notice,
              "The current proposal response did not match this Purchase Request.",
            );
          }
        } catch (error: unknown) {
          if (!this.isCurrent(revision, lease)) return;
          if (this.failClosedForAuthorization(error, lease)) return;
          notice = joinNotice(
            notice,
            "The current material-change proposal could not be loaded.",
          );
        }
      }
      if (!this.isCurrent(revision, lease)) return;
      if (
        currentProposal &&
        !history.some((proposal) => proposal.id === currentProposal?.id)
      ) {
        history = [...history, currentProposal];
      }

      const storageKey = await commandStorageKey(requestId, lease);
      if (!this.isCurrent(revision, lease)) return;
      const pending = this.readPending(storageKey);
      const inMemory = this.pendingPayloads.get(storageKey);
      let draft = draftFromRequest(request);
      let message: string | null = null;
      let pendingStillValid = false;
      let pendingPayloadAvailable = false;

      if (pending && request.status === "CHANGES_PROPOSED" && currentProposal) {
        const matchesPending = await proposalMatchesPending(
          currentProposal,
          pending,
          requestId,
        );
        if (!this.isCurrent(revision, lease)) return;
        if (matchesPending) {
          this.clearPending(storageKey);
          notice = joinNotice(
            notice,
            "The saved material-change command is confirmed by the current API state.",
          );
        } else {
          this.clearPending(storageKey);
          notice = joinNotice(
            notice,
            "The current proposal differs from the uncertain command. Review the current API terms before continuing.",
          );
        }
      } else if (pending && request.status === "CHANGES_PROPOSED") {
        pendingStillValid = true;
        pendingPayloadAvailable = inMemory?.fingerprint === pending.fingerprint;
        notice = joinNotice(
          notice,
          "The current proposal could not be verified. The saved retry marker was retained; do not start a new proposal until the API state is available.",
        );
      } else if (
        pending &&
        request.status === "SUBMITTED" &&
        request.version === pending.requestVersion &&
        etag === pending.etag
      ) {
        pendingStillValid = true;
        pendingPayloadAvailable = inMemory?.fingerprint === pending.fingerprint;
        if (pendingPayloadAvailable && inMemory)
          draft = draftFromPayload(inMemory.request, request);
        else
          message =
            "A previous proposal has an unknown outcome. Re-enter the exact same terms and reason to retry with its saved idempotency key; proposal text is not stored on this device.";
      } else if (pending) {
        this.clearPending(storageKey);
        notice = joinNotice(
          notice,
          "The Purchase Request changed after the uncertain command. The saved retry was cleared; review the current request before proposing again.",
        );
      }

      if (!etag)
        notice = joinNotice(
          notice,
          "The API did not return the current request ETag, so a proposal cannot be submitted.",
        );
      this.write(
        {
          status: "ready",
          request,
          etag,
          currentProposal,
          history,
          draft,
          pending: pendingStillValid,
          pendingPayloadAvailable,
          message,
          notice,
        },
        lease,
      );
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease)) return;
      if (this.failClosedForAuthorization(error, lease)) return;
      this.write(
        {
          ...EMPTY_STATE,
          status: "error",
          message: "This Purchase Request could not be loaded. Try again.",
        },
        lease,
      );
    }
  }

  updateDraft(
    field: Exclude<keyof MaterialChangeDraft, "lines">,
    value: string,
  ): void {
    const state = this.state();
    if (
      !state.draft ||
      state.status === "saving" ||
      this.activeProposalToken !== null
    )
      return;
    this.write(
      { ...state, draft: { ...state.draft, [field]: value }, message: null },
      this.snapshot().lease,
    );
  }

  updateLine(
    rowKey: string,
    field: Exclude<keyof MaterialChangeDraftLine, "rowKey">,
    value: string,
  ): void {
    const state = this.state();
    if (
      !state.draft ||
      state.status === "saving" ||
      this.activeProposalToken !== null
    )
      return;
    this.write(
      {
        ...state,
        draft: {
          ...state.draft,
          lines: state.draft.lines.map((line) =>
            line.rowKey === rowKey ? { ...line, [field]: value } : line,
          ),
        },
        message: null,
      },
      this.snapshot().lease,
    );
  }

  addLine(): void {
    const state = this.state();
    if (
      !state.draft ||
      state.status === "saving" ||
      this.activeProposalToken !== null
    )
      return;
    const rowKey = `draft-line-${state.draft.lines.length}-${Date.now().toString(36)}`;
    this.write(
      {
        ...state,
        draft: {
          ...state.draft,
          lines: [
            ...state.draft.lines,
            { rowKey, catalogItemId: "", quantity: "1", unit: "", notes: "" },
          ],
        },
        message: null,
      },
      this.snapshot().lease,
    );
  }

  removeLine(rowKey: string): void {
    const state = this.state();
    if (
      !state.draft ||
      state.status === "saving" ||
      this.activeProposalToken !== null
    )
      return;
    this.write(
      {
        ...state,
        draft: {
          ...state.draft,
          lines: state.draft.lines.filter((line) => line.rowKey !== rowKey),
        },
        message: null,
      },
      this.snapshot().lease,
    );
  }

  async propose(): Promise<void> {
    if (!this.canPropose() || this.activeProposalToken !== null) return;
    const state = this.state();
    const request = state.request;
    const draft = state.draft;
    const lease = this.snapshot().lease;
    if (
      !request ||
      !draft ||
      !lease ||
      !this.sessions.isSessionLeaseCurrent(lease)
    )
      return;
    if (request.status !== "SUBMITTED" || state.status === "saving") return;

    let payload: ProposeMaterialChangeRequest;
    try {
      payload = buildPayload(draft, request);
    } catch (error) {
      this.write(
        {
          ...state,
          status: "ready",
          message:
            error instanceof Error
              ? error.message
              : "Complete valid request lines before proposing changes.",
        },
        lease,
      );
      return;
    }

    const operationToken = Symbol("material-change-proposal");
    const operationRevision = this.revision;
    this.activeProposalToken = operationToken;
    this.activeProposalLease = lease;
    this.proposalBusy.set(true);
    this.write(
      { ...state, status: "saving", message: null, notice: null },
      lease,
    );

    let currentRevision = operationRevision;
    try {
      const storageKey = await commandStorageKey(request.id, lease);
      if (!this.isCurrentRequest(operationRevision, lease, request.id)) return;
      const pending = this.readPending(storageKey);
      let command: PendingMaterialChangeCommand;

      if (pending) {
        const fingerprint = await commandFingerprint(
          request.id,
          pending.requestVersion,
          payload,
        );
        if (!this.isCurrentRequest(operationRevision, lease, request.id))
          return;
        if (fingerprint !== pending.fingerprint) {
          this.write(
            {
              ...this.state(),
              status: "ready",
              message:
                "This draft does not match the uncertain proposal. Restore its exact terms and reason before retrying, or refresh the request to resolve the outcome.",
            },
            lease,
          );
          return;
        }

        const refresh = this.load(request.id);
        currentRevision = this.revision;
        await refresh;
        if (!this.isCurrentRequest(currentRevision, lease, request.id)) return;
        const refreshed = this.state();
        const refreshedPending = this.readPending(storageKey);
        if (
          !refreshedPending ||
          !refreshed.request ||
          refreshed.request.status !== "SUBMITTED" ||
          refreshed.request.version !== pending.requestVersion ||
          refreshed.etag !== pending.etag ||
          refreshedPending.fingerprint !== fingerprint
        ) {
          return;
        }
        command = { ...pending, request: payload };
        this.rememberPendingPayload(storageKey, command, lease);
        this.write(
          {
            ...refreshed,
            status: "saving",
            draft: draftFromPayload(payload, refreshed.request),
            pending: true,
            pendingPayloadAvailable: true,
            message: null,
            notice: null,
          },
          lease,
        );
      } else {
        const current = this.state();
        if (!current.etag) {
          this.write(
            {
              ...current,
              status: "ready",
              message:
                "A current request ETag is required before proposing changes.",
            },
            lease,
          );
          return;
        }
        const fingerprint = await commandFingerprint(
          request.id,
          request.version,
          payload,
        );
        if (!this.isCurrentRequest(operationRevision, lease, request.id))
          return;
        command = {
          etag: current.etag,
          idempotencyKey: `sales-pr-material-change-${createUuid()}`,
          requestVersion: request.version,
          fingerprint,
          request: payload,
        };
        try {
          this.persistPending(storageKey, command);
        } catch {
          this.write(
            {
              ...this.state(),
              status: "ready",
              message:
                "A safe retry key could not be saved. The proposal was not sent.",
            },
            lease,
          );
          return;
        }
        this.rememberPendingPayload(storageKey, command, lease);
        this.write(
          {
            ...this.state(),
            status: "saving",
            pending: true,
            pendingPayloadAvailable: true,
          },
          lease,
        );
      }

      if (
        !this.isCurrentRequest(currentRevision, lease, request.id) ||
        this.state().status !== "saving"
      ) {
        return;
      }
      await this.sendProposal(request.id, storageKey, command, lease);
    } catch {
      if (this.isCurrentRequest(currentRevision, lease, request.id)) {
        this.write(
          {
            ...this.state(),
            status: "ready",
            message:
              "The material-change command could not be prepared. Try again.",
          },
          lease,
        );
      }
    } finally {
      if (this.activeProposalToken === operationToken) {
        this.activeProposalToken = null;
        this.activeProposalLease = null;
        this.proposalBusy.set(false);
      }
    }
  }

  private async sendProposal(
    requestId: string,
    storageKey: string,
    command: PendingMaterialChangeCommand,
    lease: PlatformSessionLease,
  ): Promise<void> {
    const revision = ++this.revision;
    try {
      const response = await firstValueFrom(
        this.api.proposeMaterialChange(
          requestId,
          command.etag,
          command.idempotencyKey,
          command.request,
        ),
      );
      if (!this.isCurrent(revision, lease)) return;
      if (!response.body)
        throw new Error("The API returned an empty material-change proposal.");
      if (response.body.purchaseRequestId !== requestId)
        throw new Error("The API returned a proposal for a different request.");
      this.clearPending(storageKey);
      const state = this.state();
      const proposal = response.body;
      const request = state.request;
      this.write(
        {
          ...state,
          status: "ready",
          request: request
            ? {
                ...request,
                status: "CHANGES_PROPOSED",
                version: proposal.requestVersion,
              }
            : request,
          etag: response.headers.get("ETag") ?? state.etag,
          currentProposal: proposal,
          history: [
            ...state.history.filter((item) => item.id !== proposal.id),
            proposal,
          ],
          pending: false,
          pendingPayloadAvailable: false,
          message: null,
          notice:
            "Proposal recorded by the Sales Commitment API. The Buyer must accept material changes before conversion.",
        },
        lease,
      );
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease)) return;
      if (
        error instanceof NexaApiError &&
        (error.kind === "unauthenticated" || error.kind === "forbidden")
      ) {
        this.clearPending(storageKey);
        this.failClosedForAuthorization(error, lease);
        return;
      }
      if (error instanceof NexaApiError && error.kind === "validation") {
        this.clearPending(storageKey);
        this.write(
          {
            ...this.state(),
            status: "ready",
            pending: false,
            pendingPayloadAvailable: false,
            message: error.message || "The API rejected this proposal.",
            notice: null,
          },
          lease,
        );
        return;
      }
      if (error instanceof NexaApiError && error.kind === "not-found") {
        this.clearPending(storageKey);
        this.write(
          {
            ...EMPTY_STATE,
            status: "error",
            message: "This Purchase Request is no longer available.",
          },
          lease,
        );
        return;
      }
      if (
        error instanceof NexaApiError &&
        (error.kind === "conflict" || error.kind === "precondition")
      ) {
        const refresh = this.load(requestId);
        const refreshRevision = this.revision;
        await refresh;
        if (!this.isCurrentRequest(refreshRevision, lease, requestId)) return;
        const refreshed = this.state();
        if (refreshed.pending) {
          this.clearPending(storageKey);
          this.write(
            {
              ...refreshed,
              status: "ready",
              pending: false,
              pendingPayloadAvailable: false,
              message:
                "The Purchase Request changed or the saved command conflicted. Review the current API state before proposing again.",
              notice: null,
            },
            lease,
          );
        }
        return;
      }
      this.write(
        {
          ...this.state(),
          status: "error",
          pending: true,
          pendingPayloadAvailable: true,
          message:
            "The proposal outcome is unknown. Retry only after checking the current request; the same idempotency key and payload are saved for this session.",
        },
        lease,
      );
    }
  }

  private readPending(
    storageKey: string,
  ): PersistedMaterialChangeCommand | null {
    const raw = this.retryCommands.read(storageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedMaterialChangeCommand>;
      if (
        typeof parsed.etag === "string" &&
        typeof parsed.idempotencyKey === "string" &&
        Number.isSafeInteger(parsed.requestVersion) &&
        typeof parsed.fingerprint === "string"
      ) {
        return parsed as PersistedMaterialChangeCommand;
      }
    } catch {
      return null;
    }
    return null;
  }

  private persistPending(
    storageKey: string,
    command: PersistedMaterialChangeCommand,
  ): void {
    this.retryCommands.write(
      storageKey,
      JSON.stringify({
        etag: command.etag,
        idempotencyKey: command.idempotencyKey,
        requestVersion: command.requestVersion,
        fingerprint: command.fingerprint,
      }),
    );
  }

  private clearPending(storageKey: string): void {
    this.retryCommands.remove(storageKey);
    this.clearInMemoryPayload(storageKey);
  }

  private rememberPendingPayload(
    storageKey: string,
    command: PendingMaterialChangeCommand,
    lease: PlatformSessionLease,
  ): void {
    this.pendingPayloads.set(storageKey, command);
    this.pendingPayloadLeases.set(storageKey, lease);
  }

  private clearInMemoryPayload(storageKey: string): void {
    this.pendingPayloads.delete(storageKey);
    this.pendingPayloadLeases.delete(storageKey);
  }

  private clearAllInMemoryPayloads(): void {
    this.pendingPayloads.clear();
    this.pendingPayloadLeases.clear();
  }

  private isCurrentRequest(
    revision: number,
    lease: PlatformSessionLease,
    requestId: string,
  ): boolean {
    return (
      this.isCurrent(revision, lease) && this.state().request?.id === requestId
    );
  }

  private failClosedForAuthorization(
    error: unknown,
    lease: PlatformSessionLease,
  ): boolean {
    if (
      !(error instanceof NexaApiError) ||
      (error.kind !== "unauthenticated" && error.kind !== "forbidden")
    ) {
      return false;
    }

    this.clearAllInMemoryPayloads();
    let visibleLease: PlatformSessionLease | null = lease;
    let message =
      "The API denied access to this request or its material-change data. Request details and proposal actions are hidden.";
    if (error.kind === "unauthenticated") {
      this.sessions.expireSessionIfCurrent(lease);
      visibleLease = null;
      message =
        "Your Platform session expired. Sign in again to load this request.";
    } else if (
      error.problem?.code === "ACCESS_CONTEXT_INVALID" &&
      this.sessions.invalidateContextIfCurrent(lease)
    ) {
      visibleLease = null;
      message =
        "The active Platform context is no longer valid. Sign in again.";
    }
    this.write({ ...EMPTY_STATE, status: "error", message }, visibleLease);
    return true;
  }

  private isCurrent(revision: number, lease: PlatformSessionLease): boolean {
    return (
      revision === this.revision && this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private write(
    state: PlatformPurchaseRequestMaterialChangeState,
    lease: PlatformSessionLease | null,
  ): void {
    this.snapshot.set({ state, lease });
  }
}

function draftFromRequest(request: PurchaseRequestDetail): MaterialChangeDraft {
  return {
    reason: "",
    priority: request.priority ?? "NORMAL",
    requestedDeliveryDate: request.requestedDeliveryDate ?? "",
    deliveryProfileSnapshot: request.deliveryProfileSnapshot ?? "",
    paymentOption: request.paymentOption ?? "",
    comment: request.comment ?? "",
    lines: request.lines.map((line) => ({
      rowKey: line.id,
      catalogItemId: line.catalogItemId ?? "",
      quantity: String(line.quantity),
      unit: line.unit ?? "",
      notes: line.notes ?? "",
    })),
  };
}

function draftFromPayload(
  payload: ProposeMaterialChangeRequest,
  request: PurchaseRequestDetail,
): MaterialChangeDraft {
  const lines = payload.lines ?? [];
  return {
    reason: payload.reason ?? "",
    priority: payload.priority ?? "",
    requestedDeliveryDate: payload.requestedDeliveryDate ?? "",
    deliveryProfileSnapshot: payload.deliveryProfileSnapshot ?? "",
    paymentOption: payload.paymentOption ?? "",
    comment: payload.comment ?? "",
    lines: lines.map((line, index) => ({
      rowKey: request.lines[index]?.id ?? `pending-line-${index}`,
      catalogItemId: line.catalogItemId,
      quantity: String(line.quantity),
      unit: line.unit,
      notes: line.notes ?? "",
    })),
  };
}

function buildPayload(
  draft: MaterialChangeDraft,
  request: PurchaseRequestDetail,
): ProposeMaterialChangeRequest {
  if (draft.lines.length === 0 || draft.lines.length > 100) {
    throw new Error(
      "A material-change proposal must include between 1 and 100 request lines.",
    );
  }
  const seen = new Set<string>();
  const lines = draft.lines.map((line) => {
    const catalogItemId = line.catalogItemId.trim();
    const unit = line.unit.trim();
    const quantity = Number(line.quantity);
    if (
      !catalogItemId ||
      catalogItemId.length > 64 ||
      !unit ||
      unit.length > 32 ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      throw new Error(
        "Each line needs a catalog item ID, positive quantity, and unit.",
      );
    }
    if (seen.has(catalogItemId))
      throw new Error(
        "Each catalog item can appear only once in the proposed lines.",
      );
    seen.add(catalogItemId);
    const notes = line.notes.trim();
    if (notes.length > 2000)
      throw new Error("Line notes must be 2,000 characters or fewer.");
    return { catalogItemId, quantity, unit, notes: notes || null };
  });

  const priority = draft.priority.trim().toUpperCase();
  if (priority && !["NORMAL", "HIGH", "URGENT"].includes(priority))
    throw new Error("Select a supported request priority.");
  if (
    draft.requestedDeliveryDate &&
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.requestedDeliveryDate)
  )
    throw new Error("Enter a valid requested delivery date.");
  const paymentOption = draft.paymentOption.trim().toUpperCase();
  if (
    paymentOption &&
    ![
      "CREDIT_LINE",
      "BANK_TRANSFER",
      "CARD_STRIPE",
      "WALLET",
      "CASH",
      "CASH_ON_DELIVERY",
      "PREPAID",
      "IMMEDIATE",
    ].includes(paymentOption)
  ) {
    throw new Error("Select a supported payment option.");
  }
  if (
    draft.reason.length > 2000 ||
    draft.deliveryProfileSnapshot.length > 2000 ||
    draft.comment.length > 2000
  ) {
    throw new Error(
      "Reason, delivery profile, and comment fields must be 2,000 characters or fewer.",
    );
  }

  return {
    reason: draft.reason.trim() || null,
    priority: priority || request.priority || null,
    requestedDeliveryDate:
      draft.requestedDeliveryDate || request.requestedDeliveryDate || null,
    deliveryProfileSnapshot: optionalText(
      draft.deliveryProfileSnapshot,
      request.deliveryProfileSnapshot,
    ),
    paymentOption: paymentOption || request.paymentOption || null,
    comment: optionalText(draft.comment, request.comment),
    lines,
  };
}

function optionalText(value: string, original: string | null): string | null {
  if (value.length > 2000) return value;
  if (value.trim().length > 0) return value.trim();
  return original === null ? null : "";
}

async function proposalMatchesPending(
  proposal: MaterialChangeProposal,
  pending: PersistedMaterialChangeCommand,
  requestId: string,
): Promise<boolean> {
  if (
    proposal.purchaseRequestId !== requestId ||
    proposal.requestVersion !== pending.requestVersion + 1
  )
    return false;
  const payload: ProposeMaterialChangeRequest = {
    reason: proposal.reason,
    priority: proposal.proposedTerms.priority,
    requestedDeliveryDate: proposal.proposedTerms.requestedDeliveryDate,
    deliveryProfileSnapshot: proposal.proposedTerms.deliveryProfileSnapshot,
    paymentOption: proposal.proposedTerms.paymentOption,
    comment: proposal.proposedTerms.comment,
    lines: proposal.proposedTerms.lines.map((line) => ({
      catalogItemId: line.catalogItemId ?? "",
      quantity: Number(line.quantity),
      unit: line.unit ?? "",
      notes: line.notes,
    })),
  };
  const fingerprint = await commandFingerprint(
    requestId,
    pending.requestVersion,
    payload,
  );
  return fingerprint === pending.fingerprint;
}

async function commandFingerprint(
  requestId: string,
  version: number,
  payload: ProposeMaterialChangeRequest,
): Promise<string> {
  const canonical = canonicalPayload(payload);
  return sha256(`${requestId}\n${version}\n${JSON.stringify(canonical)}`);
}

function canonicalPayload(
  payload: ProposeMaterialChangeRequest,
): ProposeMaterialChangeRequest {
  return {
    reason: payload.reason ?? null,
    priority: payload.priority ?? null,
    requestedDeliveryDate: payload.requestedDeliveryDate ?? null,
    deliveryProfileSnapshot: payload.deliveryProfileSnapshot ?? null,
    paymentOption: payload.paymentOption ?? null,
    comment: payload.comment ?? null,
    lines: (payload.lines ?? []).map((line) => ({
      catalogItemId: line.catalogItemId,
      quantity: Number(line.quantity),
      unit: line.unit,
      notes: line.notes ?? null,
    })),
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function commandStorageKey(
  requestId: string,
  lease: PlatformSessionLease,
): Promise<string> {
  const requestHash = await sha256(requestId);
  return [
    "nexa",
    "platform",
    "purchase-request-material-change",
    lease.scope.tenantId,
    lease.scope.workspaceId,
    lease.scope.membershipId,
    requestHash,
  ]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

function createUuid(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== "function") {
    throw new Error("Secure UUID generation is unavailable.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function joinNotice(current: string | null, next: string): string {
  return current ? `${current} ${next}` : next;
}
