import { computed, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import {
  NexaBuyerRelationshipsApi,
  NexaCommandRetryStore,
  NexaSalesCommitmentApi,
} from "@nexa/api";
import type {
  BuyerAddressResponse,
  PurchaseRequestDraft,
  PurchaseRequestDraftLineInput,
  PurchaseRequestDraftReview,
  SetPurchaseRequestDraftPreferencesRequest,
} from "@nexa/api";
import {
  PortalSessionStore,
  type PortalSessionLease,
} from "../../tenant-access-governance/application/public-api";

export type BuyerDraftWorkflowStatus =
  | "idle"
  | "loading"
  | "ready"
  | "saving"
  | "submitting"
  | "submitted"
  | "error";

export interface BuyerDraftWorkflowState {
  readonly status: BuyerDraftWorkflowStatus;
  readonly draft: PurchaseRequestDraft | null;
  readonly review: PurchaseRequestDraftReview | null;
  readonly addresses: readonly BuyerAddressResponse[];
  readonly submissionKeyPending: boolean;
  readonly errorMessage: string | null;
}

const EMPTY_STATE: BuyerDraftWorkflowState = {
  status: "idle",
  draft: null,
  review: null,
  addresses: [],
  submissionKeyPending: false,
  errorMessage: null,
};

/** Buyer orchestration for the API-owned draft and submission lifecycle. */
@Injectable({ providedIn: "root" })
export class BuyerPurchaseRequestDraftStore {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly relationships = inject(NexaBuyerRelationshipsApi);
  private readonly retryCommands = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PortalSessionStore);
  private revision = 0;
  private readonly snapshot = signal<{
    readonly state: BuyerDraftWorkflowState;
    readonly lease: PortalSessionLease | null;
  }>({ state: EMPTY_STATE, lease: null });

  readonly state = computed(() => {
    const value = this.snapshot();
    return value.lease && this.sessions.isSessionLeaseCurrent(value.lease)
      ? value.state
      : EMPTY_STATE;
  });

  async loadAddresses(accountId: string): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    try {
      const addresses = await firstValueFrom(
        this.relationships.listAccountAddresses(accountId),
      );
      if (!this.sessions.isSessionLeaseCurrent(lease)) return;
      const state = this.state();
      this.write({ ...state, addresses: addresses.filter((item) => item.active) }, lease);
    } catch {
      if (!this.sessions.isSessionLeaseCurrent(lease)) return;
      const state = this.state();
      this.write({
        ...state,
        errorMessage: "Saved delivery addresses could not be loaded. Retry before selecting a destination.",
      }, lease);
    }
  }

  async createDraft(accountId: string, requestedDeliveryDate: string): Promise<PurchaseRequestDraft | null> {
    if (this.state().status === "loading") return null;
    const lease = this.sessions.captureSessionLease();
    if (!lease || !accountId.trim() || !requestedDeliveryDate) return null;
    const revision = ++this.revision;
    const addresses = this.state().addresses;
    this.write({ ...EMPTY_STATE, status: "loading" }, lease);
    try {
      const response = await firstValueFrom(
        this.api.createDraft({ clientAccountId: accountId, requestedDeliveryDate }),
      );
      if (!this.isCurrent(revision, lease)) return null;
      if (!response.body) throw new Error("The API returned an empty draft response.");
      this.write({
        status: "ready",
        draft: response.body,
        review: null,
        addresses,
        submissionKeyPending: this.hasStoredSubmitKey(response.body.id, lease),
        errorMessage: null,
      }, lease);
      return response.body;
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease)) return null;
      this.write({
        ...this.state(),
        status: "error",
        errorMessage: "The draft could not be confirmed. Open My requests to check whether it was created before starting another draft.",
      }, lease);
      return null;
    }
  }

  async loadDraft(draftId: string): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease || !draftId.trim()) return;
    const revision = ++this.revision;
    const previous = this.state();
    this.write({
      ...EMPTY_STATE,
      status: "loading",
      addresses: previous.addresses,
    }, lease);
    try {
      const response = await firstValueFrom(this.api.getDraft(draftId));
      if (!this.isCurrent(revision, lease)) return;
      if (!response.body) throw new Error("The API returned an empty draft response.");
      const pending = response.body.status === "SUBMITTED"
        ? false
        : this.hasStoredSubmitKey(draftId, lease);
      if (!pending) this.removeStoredSubmitKey(draftId, lease);
      this.write({
        status: response.body.status === "SUBMITTED" ? "submitted" : "ready",
        draft: response.body,
        review: null,
        addresses: previous.addresses,
        submissionKeyPending: pending,
        errorMessage: null,
      }, lease);
      if (response.body.status !== "SUBMITTED") {
        try {
          const review = await firstValueFrom(this.api.getDraftReview(draftId));
          if (!this.isCurrent(revision, lease)) return;
          this.write({ ...this.state(), review }, lease);
        } catch {
          if (!this.isCurrent(revision, lease)) return;
          this.write({
            ...this.state(),
            status: "error",
            errorMessage: "The draft loaded, but its current review checks are unavailable. Refresh the checks before submitting.",
          }, lease);
        }
      }
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease)) return;
      this.write({
        ...this.state(),
        status: "error",
        errorMessage: "This draft could not be loaded. Refresh the page and try again.",
      }, lease);
    }
  }

  async replaceLines(lines: readonly PurchaseRequestDraftLineInput[]): Promise<void> {
    const draft = this.requireMutableDraft();
    if (!draft) return;
    await this.mutate((lease) =>
      firstValueFrom(this.api.replaceDraftLines(draft.id, draft.version, lines)),
      leaseFor(this.sessions, this.snapshot().lease),
    );
  }

  async setDestination(addressId: string): Promise<void> {
    const draft = this.requireMutableDraft();
    if (!draft || !addressId.trim()) return;
    const lease = this.snapshot().lease;
    if (!lease) return;
    await this.mutate(
      () => firstValueFrom(this.api.setDraftDestination(draft.id, draft.version, addressId)),
      lease,
    );
  }

  async setPreferences(request: SetPurchaseRequestDraftPreferencesRequest): Promise<void> {
    const draft = this.requireMutableDraft();
    if (!draft) return;
    const lease = this.snapshot().lease;
    if (!lease) return;
    await this.mutate(
      () => firstValueFrom(this.api.setDraftPreferences(draft.id, draft.version, request)),
      lease,
    );
  }

  async previewRoute(): Promise<void> {
    const draft = this.requireMutableDraft();
    if (!draft) return;
    const lease = this.snapshot().lease;
    if (!lease) return;
    await this.mutate(
      () => firstValueFrom(this.api.previewDraftRoute(draft.id, draft.version)),
      lease,
    );
  }

  async refreshReview(): Promise<void> {
    const draft = this.state().draft;
    const lease = this.snapshot().lease;
    if (!draft || !lease || !this.sessions.isSessionLeaseCurrent(lease)) return;
    const revision = ++this.revision;
    this.write({ ...this.state(), status: "loading", errorMessage: null }, lease);
    try {
      const review = await firstValueFrom(this.api.getDraftReview(draft.id));
      if (!this.isCurrent(revision, lease)) return;
      this.write({ ...this.state(), status: "ready", review, errorMessage: null }, lease);
    } catch {
      if (!this.isCurrent(revision, lease)) return;
      this.write({
        ...this.state(),
        status: "error",
        errorMessage: "The latest submission checks could not be loaded.",
      }, lease);
    }
  }

  async submit(): Promise<void> {
    const current = this.state();
    if (current.status === "submitting") return;
    const draft = current.draft;
    const lease = this.snapshot().lease;
    if (!draft || !lease || !this.sessions.isSessionLeaseCurrent(lease)) return;
    if (draft.status === "SUBMITTED") return;
    const revision = ++this.revision;
    const idempotencyKey = this.readOrCreateSubmitKey(draft.id, lease);
    this.write({ ...this.state(), status: "submitting", errorMessage: null }, lease);
    try {
      const response = await firstValueFrom(
        this.api.submitDraft(draft.id, draft.version, idempotencyKey),
      );
      if (!this.isCurrent(revision, lease)) return;
      if (!response.body) throw new Error("The API returned an empty submission response.");
      const submitted = response.body;
      this.removeStoredSubmitKey(draft.id, lease);
      this.write({
        ...this.state(),
        status: submitted.status === "SUBMITTED" ? "submitted" : "ready",
        draft: submitted,
        review: null,
        submissionKeyPending: false,
        errorMessage: null,
      }, lease);
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease)) return;
      this.write({
        ...this.state(),
        status: "error",
        submissionKeyPending: true,
        errorMessage: "We couldn’t confirm the result. Retry without changing this request.",
      }, lease);
    }
  }

  clear(): void {
    this.revision++;
    this.snapshot.set({ state: EMPTY_STATE, lease: null });
  }

  private async mutate(
    action: (lease: PortalSessionLease) => Promise<{ readonly body: PurchaseRequestDraft | null }>,
    lease: PortalSessionLease,
  ): Promise<void> {
    const current = this.state();
    const draft = current.draft;
    if (!draft || !this.sessions.isSessionLeaseCurrent(lease)) return;
    const revision = ++this.revision;
    this.write({ ...current, status: "saving", errorMessage: null }, lease);
    try {
      const response = await action(lease);
      if (!this.isCurrent(revision, lease)) return;
      if (!response.body) throw new Error("The API returned an empty draft response.");
      this.write({
        ...this.state(),
        status: "ready",
        draft: response.body,
        review: null,
        errorMessage: null,
      }, lease);
      try {
        const review = await firstValueFrom(this.api.getDraftReview(response.body.id));
        if (!this.isCurrent(revision, lease)) return;
        this.write({ ...this.state(), review }, lease);
      } catch {
        if (!this.isCurrent(revision, lease)) return;
        this.write({
          ...this.state(),
          status: "error",
          errorMessage: "Your draft change was saved, but the latest review checks could not be loaded. Refresh the checks before submitting.",
        }, lease);
      }
    } catch {
      if (!this.isCurrent(revision, lease)) return;
      this.write({
        ...this.state(),
        status: "error",
        errorMessage: "This change could not be confirmed. Reload the draft before editing it again so the current version is used.",
      }, lease);
    }
  }

  private requireMutableDraft(): PurchaseRequestDraft | null {
    const state = this.state();
    if (!state.draft || state.status === "saving" || state.status === "submitting" || state.status === "loading") return null;
    if (state.draft.status === "SUBMITTED") return null;
    if (state.submissionKeyPending) {
      this.write({
        ...state,
        status: "error",
        errorMessage: "We couldn’t confirm the result. Retry submission without changing this request.",
      }, this.snapshot().lease);
      return null;
    }
    return state.draft;
  }

  private readOrCreateSubmitKey(draftId: string, lease: PortalSessionLease): string {
    const storageKey = submitStorageKey(draftId, lease);
    const existing = this.retryCommands.read(storageKey);
    if (existing) return existing;
    const key = createIdempotencyKey();
    this.retryCommands.write(storageKey, key);
    return key;
  }

  private hasStoredSubmitKey(draftId: string, lease: PortalSessionLease): boolean {
    const storageKey = submitStorageKey(draftId, lease);
    return this.retryCommands.read(storageKey) !== null;
  }

  private removeStoredSubmitKey(draftId: string, lease: PortalSessionLease): void {
    const storageKey = submitStorageKey(draftId, lease);
    this.retryCommands.remove(storageKey);
  }

  private isCurrent(revision: number, lease: PortalSessionLease): boolean {
    return revision === this.revision && this.sessions.isSessionLeaseCurrent(lease);
  }

  private write(state: BuyerDraftWorkflowState, lease: PortalSessionLease | null): void {
    this.snapshot.set({ state, lease });
  }
}

function leaseFor(
  sessions: PortalSessionStore,
  lease: PortalSessionLease | null,
): PortalSessionLease {
  if (!lease || !sessions.isSessionLeaseCurrent(lease)) {
    throw new Error("A current Buyer session is required to edit this draft.");
  }
  return lease;
}

function submitStorageKey(draftId: string, lease: PortalSessionLease): string {
  const { tenantId, workspaceId, membershipId } = lease.scope;
  return [
    "nexa",
    "buyer",
    "purchase-request-submit",
    tenantId,
    workspaceId,
    membershipId,
    draftId,
  ].map((part) => encodeURIComponent(part)).join(":");
}

function createIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `buyer-pr-submit-${uuid}`;
  return `buyer-pr-submit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

