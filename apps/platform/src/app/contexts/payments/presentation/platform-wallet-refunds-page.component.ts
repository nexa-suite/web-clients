import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { Router } from "@angular/router";
import {
  NexaApiError,
  NexaCommandRetryStore,
  NexaWalletRefundsApi,
} from "@nexa/api";
import type {
  WalletRefundCandidate,
  WalletRefundCandidatesPage,
  WalletRefundRequest,
  WalletRefundResponse,
} from "@nexa/api";
import { firstValueFrom } from "rxjs";
import { NexaButton, NexaSurface } from "nexa-ui";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "../../tenant-access-governance/application/public-api";
import { walletRefundRetryIdentity } from "../application/wallet-refund-command-retry";

type CandidateState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly page: WalletRefundCandidatesPage }
  | {
      readonly status: "error";
      readonly message: string;
      readonly retryable: boolean;
    };

interface PendingRefund {
  readonly salesOrderId: string;
  readonly lease: PlatformSessionLease;
  readonly formRevision: number;
  readonly request: WalletRefundRequest;
  readonly idempotencyKey: string;
  readonly storageKey: string;
}

type Feedback = {
  readonly status: "success" | "error";
  readonly message: string;
} | null;

const PAGE_SIZE = 25;
const REFUND_PERMISSION = "payment.reconcile";
const ALLOWED_ROLES = new Set(["BUSINESS_OPERATIONS_MANAGER", "COMPANY_OWNER"]);
const AMOUNT_PATTERN = /^[0-9]{1,15}(?:\.[0-9]{1,4})?$/;
const MAX_REASON_LENGTH = 500;

@Component({
  selector: "platform-wallet-refunds-page",
  standalone: true,
  imports: [NexaButton, NexaSurface],
  templateUrl: "./platform-wallet-refunds-page.component.html",
  styleUrl: "./platform-wallet-refunds-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformWalletRefundsPageComponent implements OnInit {
  private readonly api = inject(NexaWalletRefundsApi);
  private readonly retries = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly router = inject(Router);
  private readonly contextLease = signal<PlatformSessionLease | null>(
    this.sessions.captureSessionLease(),
  );
  private readonly contextAuthorizationFingerprint = signal(
    this.authorizationFingerprint(),
  );
  private initialized = false;
  private lastCanRefund: boolean | null = null;
  private candidateRevision = 0;
  private formRevision = 0;
  private commandRevision = 0;

  protected readonly candidates = signal<CandidateState>({ status: "idle" });
  protected readonly selectedCandidate = signal<WalletRefundCandidate | null>(
    null,
  );
  protected readonly pageIndex = signal(0);
  protected readonly amount = signal("");
  protected readonly reason = signal("");
  protected readonly preparing = signal(false);
  protected readonly saving = signal(false);
  protected readonly pending = signal<PendingRefund | null>(null);
  protected readonly feedback = signal<Feedback>(null);
  protected readonly lastRefund = signal<WalletRefundResponse | null>(null);

  protected readonly contextIsCurrent = computed(() => {
    const lease = this.sessions.captureSessionLease();
    return (
      sameLease(this.contextLease(), lease) &&
      this.contextAuthorizationFingerprint() === this.authorizationFingerprint()
    );
  });

  protected readonly canRefund = computed(() => {
    const current = this.sessions.state();
    if (current.status !== "authenticated" || !this.contextIsCurrent()) {
      return false;
    }
    const session = current.session;
    const roles = new Set(session.membership?.roles ?? []);
    const permissions = new Set(session.membership?.permissions ?? []);
    return (
      session.surface === "PLATFORM" &&
      [...ALLOWED_ROLES].some((role) => roles.has(role)) &&
      permissions.has(REFUND_PERMISSION)
    );
  });

  protected readonly canSubmit = computed(() => {
    const state = this.candidates();
    const candidate = this.selectedCandidate();
    const parsedAmount = this.parsedAmount();
    const normalizedReason = this.reason().trim();
    return (
      this.canRefund() &&
      state.status === "ready" &&
      candidate !== null &&
      state.page.items.some(
        (item) => item.salesOrderId === candidate.salesOrderId,
      ) &&
      parsedAmount !== null &&
      parsedAmount <= candidate.refundablePEN &&
      normalizedReason.length > 0 &&
      normalizedReason.length <= MAX_REASON_LENGTH &&
      !this.preparing() &&
      !this.saving() &&
      this.pending() === null
    );
  });

  protected readonly canRetry = computed(() => {
    const command = this.pending();
    return (
      command !== null &&
      !this.saving() &&
      this.canRefund() &&
      this.sessions.isSessionLeaseCurrent(command.lease) &&
      sameLease(this.contextLease(), command.lease) &&
      this.isFormFor(command)
    );
  });
  protected readonly amountHint = computed(() => {
    const value = this.amount().trim();
    if (!value) {
      return "Enter a positive PEN amount with up to four decimal places.";
    }
    if (
      !AMOUNT_PATTERN.test(value) ||
      !Number.isFinite(Number(value)) ||
      Number(value) <= 0
    ) {
      return "Enter a positive PEN amount with up to four decimal places.";
    }
    const candidate = this.selectedCandidate();
    if (candidate && Number(value) > candidate.refundablePEN) {
      return `The amount exceeds the API-reported refundable amount of ${this.formatPEN(candidate.refundablePEN)}.`;
    }
    return "The API will verify the amount again before posting.";
  });
  protected readonly amountIsInvalid = computed(() => {
    const value = this.amount().trim();
    if (!value) return false;
    const parsedAmount = this.parsedAmount();
    const candidate = this.selectedCandidate();
    return (
      parsedAmount === null ||
      candidate === null ||
      parsedAmount > candidate.refundablePEN
    );
  });

  protected readonly formLocked = computed(
    () => this.preparing() || this.saving() || this.pending() !== null,
  );

  constructor() {
    effect(() => {
      const lease = this.sessions.captureSessionLease();
      const authorized = this.canRefund();
      const authorizationFingerprint = this.authorizationFingerprint();
      const priorLease = untracked(() => this.contextLease());
      const priorAuthorizationFingerprint = untracked(() =>
        this.contextAuthorizationFingerprint(),
      );
      const leaseChanged = !sameLease(priorLease, lease);
      const authorizationChanged =
        authorizationFingerprint !== priorAuthorizationFingerprint;
      const wasAuthorized = this.lastCanRefund;
      const permissionGranted = authorized && wasAuthorized === false;
      this.lastCanRefund = authorized;

      if (leaseChanged || authorizationChanged) {
        this.clearContextState();
        this.contextLease.set(lease);
        this.contextAuthorizationFingerprint.set(authorizationFingerprint);
      } else if (!authorized && wasAuthorized) {
        this.clearContextState();
      }

      if (
        lease &&
        authorized &&
        this.initialized &&
        (leaseChanged || authorizationChanged || permissionGranted)
      ) {
        void this.loadCandidates();
      }
    });
  }

  ngOnInit(): void {
    this.initialized = true;
    void this.loadCandidates();
  }

  protected setAmount(event: Event): void {
    this.setAmountValue((event.target as HTMLInputElement).value);
  }

  protected setAmountValue(next: string): void {
    if (this.formLocked()) return;
    if (next === this.amount()) return;
    this.formRevision += 1;
    this.amount.set(next);
    this.feedback.set(null);
    this.lastRefund.set(null);
  }

  protected useFullRefund(): void {
    const candidate = this.selectedCandidate();
    if (!this.canRefund() || !candidate) return;
    this.setAmountValue(String(candidate.refundablePEN));
  }

  protected setReason(event: Event): void {
    if (this.formLocked()) return;
    const next = (event.target as HTMLTextAreaElement).value;
    if (next === this.reason()) return;
    this.formRevision += 1;
    this.reason.set(next);
    this.feedback.set(null);
    this.lastRefund.set(null);
  }

  protected selectCandidate(candidate: WalletRefundCandidate): void {
    const state = this.candidates();
    if (this.formLocked() || !this.canRefund() || state.status !== "ready") {
      return;
    }
    const current = state.page.items.find(
      (item) => item.salesOrderId === candidate.salesOrderId,
    );
    if (!current) return;
    this.formRevision += 1;
    this.selectedCandidate.set(current);
    this.amount.set("");
    this.reason.set("");
    this.feedback.set(null);
    this.lastRefund.set(null);
  }

  protected async loadCandidates(page = this.pageIndex()): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.candidateRevision;
    if (!this.canRefund() || !lease) {
      this.candidates.set({ status: "idle" });
      return;
    }
    if (!Number.isSafeInteger(page) || page < 0) return;
    this.candidates.set({ status: "loading" });
    try {
      const result = await firstValueFrom(this.api.candidates(page, PAGE_SIZE));
      if (!this.isCandidateRequestCurrent(revision, lease)) return;
      validateCandidatePage(result, page);
      this.candidates.set({ status: "ready", page: result });
      const selectedId = this.selectedCandidate()?.salesOrderId;
      if (selectedId) {
        const updated = result.items.find(
          (item) => item.salesOrderId === selectedId,
        );
        if (updated) {
          this.selectedCandidate.set(updated);
        } else {
          this.clearSelection();
        }
      }
    } catch (error: unknown) {
      if (!this.isCandidateRequestCurrent(revision, lease)) return;
      if (this.handleSessionError(error, lease)) return;
      this.candidates.set({
        status: "error",
        message: candidateLoadErrorMessage(error),
        retryable: !(
          error instanceof NexaApiError && error.kind === "forbidden"
        ),
      });
    }
  }

  protected async changePage(offset: number): Promise<void> {
    const state = this.candidates();
    if (state.status !== "ready" || this.formLocked()) return;
    const totalPages = this.totalPages(state.page);
    const next = this.pageIndex() + offset;
    if (next < 0 || next >= totalPages) return;
    this.pageIndex.set(next);
    this.clearSelection();
    await this.loadCandidates(next);
  }

  protected async submitRefund(): Promise<void> {
    if (!this.canSubmit()) return;
    const candidate = this.selectedCandidate();
    const amountPEN = this.parsedAmount();
    const lease = this.sessions.captureSessionLease();
    if (!candidate || amountPEN === null || !lease) return;

    const formRevision = this.formRevision;
    const request: WalletRefundRequest = {
      amountPEN,
      reason: this.reason().trim(),
    };
    this.preparing.set(true);
    this.feedback.set(null);
    this.lastRefund.set(null);
    let identity;
    try {
      identity = await walletRefundRetryIdentity(
        this.retries,
        this.sessions,
        lease,
        candidate.salesOrderId,
        request,
      );
    } catch {
      identity = null;
    } finally {
      this.preparing.set(false);
    }

    if (
      !identity ||
      formRevision !== this.formRevision ||
      !this.canRefund() ||
      !this.sessions.isSessionLeaseCurrent(lease) ||
      !sameLease(this.contextLease(), lease) ||
      this.selectedCandidate()?.salesOrderId !== candidate.salesOrderId
    ) {
      this.feedback.set({
        status: "error",
        message: identity
          ? "The active authorization or refund details changed. The refund was not sent. Review the current order before continuing."
          : "A secure scoped retry key could not be created. The refund was not sent.",
      });
      return;
    }

    await this.sendRefund({
      salesOrderId: candidate.salesOrderId,
      lease,
      formRevision,
      request,
      idempotencyKey: identity.key,
      storageKey: identity.storageKey,
    });
  }

  protected async retrySameRefund(): Promise<void> {
    const command = this.pending();
    if (!command || !this.canRetry()) return;
    await this.sendRefund(command);
  }

  protected formatPEN(value: number): string {
    return `PEN ${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value)}`;
  }

  protected totalPages(page: WalletRefundCandidatesPage): number {
    return Math.max(1, Math.ceil(page.total / Math.max(page.size, 1)));
  }

  private async sendRefund(command: PendingRefund): Promise<void> {
    if (this.saving() || !this.isCommandCurrent(command)) return;
    const revision = ++this.commandRevision;
    this.saving.set(true);
    this.feedback.set(null);
    try {
      const response = await firstValueFrom(
        this.api.refund(
          command.salesOrderId,
          command.request,
          command.idempotencyKey,
        ),
      );
      if (!this.isCommandCurrent(command)) return;
      if (!isValidRefundResponse(response, command)) {
        throw new Error(
          "The refund response did not match the submitted command.",
        );
      }

      this.retries.remove(command.storageKey);
      this.pending.set(null);
      this.lastRefund.set(response);
      this.amount.set("");
      this.reason.set("");
      this.formRevision += 1;
      await this.loadCandidates(this.pageIndex());
      if (!this.contextIsCurrent() || !this.canRefund()) return;
      const refreshed = this.candidates().status === "ready";
      this.feedback.set({
        status: "success",
        message: refreshed
          ? "Refund posted. Candidate balances were refreshed from the API."
          : "Refund posted. Candidate data could not be refreshed; reload before starting another refund.",
      });
    } catch (error: unknown) {
      if (!this.isCommandCurrent(command)) return;
      if (this.handleSessionError(error, command.lease)) return;
      if (isAmbiguousRefundError(error)) {
        this.pending.set(command);
        this.feedback.set({
          status: "error",
          message:
            "The refund result is uncertain. Retry this same refund with its original command key before changing the amount or reason.",
        });
        return;
      }

      this.retries.remove(command.storageKey);
      this.pending.set(null);
      this.feedback.set({
        status: "error",
        message: refundErrorMessage(error),
      });
      if (
        error instanceof NexaApiError &&
        (error.kind === "conflict" || error.kind === "not-found")
      ) {
        await this.loadCandidates(this.pageIndex());
      }
    } finally {
      if (revision === this.commandRevision) this.saving.set(false);
    }
  }

  private clearContextState(): void {
    this.candidateRevision += 1;
    this.formRevision += 1;
    this.commandRevision += 1;
    this.candidates.set({ status: "idle" });
    this.selectedCandidate.set(null);
    this.pageIndex.set(0);
    this.amount.set("");
    this.reason.set("");
    this.preparing.set(false);
    this.saving.set(false);
    this.pending.set(null);
    this.feedback.set(null);
    this.lastRefund.set(null);
  }

  private clearSelection(): void {
    this.formRevision += 1;
    this.selectedCandidate.set(null);
    this.amount.set("");
    this.reason.set("");
    this.feedback.set(null);
    this.lastRefund.set(null);
  }

  private authorizationFingerprint(): string {
    const current = this.sessions.state();
    if (current.status !== "authenticated") return "unauthenticated";
    const membership = current.session.membership;
    return JSON.stringify({
      authorizationVersion: membership?.authorizationVersion ?? null,
      roles: [...(membership?.roles ?? [])].sort(),
      permissions: [...(membership?.permissions ?? [])].sort(),
      roleDefinitionIds: [...(membership?.roleDefinitionIds ?? [])].sort(),
    });
  }

  private parsedAmount(): number | null {
    const value = this.amount().trim();
    if (!AMOUNT_PATTERN.test(value)) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private isFormFor(command: PendingRefund): boolean {
    return (
      this.formRevision === command.formRevision &&
      this.selectedCandidate()?.salesOrderId === command.salesOrderId &&
      this.parsedAmount() === command.request.amountPEN &&
      this.reason().trim() === command.request.reason
    );
  }

  private isCommandCurrent(command: PendingRefund): boolean {
    return (
      this.isFormFor(command) &&
      this.sessions.isSessionLeaseCurrent(command.lease) &&
      sameLease(this.contextLease(), command.lease) &&
      this.contextIsCurrent() &&
      this.canRefund()
    );
  }

  private isCandidateRequestCurrent(
    revision: number,
    lease: PlatformSessionLease,
  ): boolean {
    return (
      revision === this.candidateRevision &&
      this.sessions.isSessionLeaseCurrent(lease) &&
      sameLease(this.contextLease(), lease) &&
      this.contextIsCurrent() &&
      this.canRefund()
    );
  }

  private handleSessionError(
    error: unknown,
    lease: PlatformSessionLease,
  ): boolean {
    if (!(error instanceof NexaApiError)) return false;
    if (error.kind === "unauthenticated") {
      if (this.sessions.expireSessionIfCurrent(lease)) {
        void this.router.navigate(["/sign-in"], {
          queryParams: { returnUrl: this.router.url },
        });
      }
      return true;
    }
    if (error.problem?.code === "ACCESS_CONTEXT_INVALID") {
      if (this.sessions.invalidateContextIfCurrent(lease)) {
        void this.router.navigate(["/sign-in"], {
          queryParams: { returnUrl: this.router.url },
        });
      }
      return true;
    }
    return false;
  }
}

function sameLease(
  left: PlatformSessionLease | null,
  right: PlatformSessionLease | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.epoch === right.epoch &&
    left.scope.userId === right.scope.userId &&
    left.scope.tenantId === right.scope.tenantId &&
    left.scope.workspaceId === right.scope.workspaceId &&
    left.scope.membershipId === right.scope.membershipId &&
    left.scope.surface === right.scope.surface
  );
}

function validateCandidatePage(
  page: WalletRefundCandidatesPage,
  requestedPage: number,
): void {
  if (
    !page ||
    !Array.isArray(page.items) ||
    page.page !== requestedPage ||
    page.size !== PAGE_SIZE ||
    !Number.isSafeInteger(page.total) ||
    page.total < 0 ||
    page.items.length > PAGE_SIZE
  ) {
    throw new Error(
      "The API returned an invalid wallet-refund candidate page.",
    );
  }
  for (const candidate of page.items) {
    if (
      !candidate ||
      typeof candidate.salesOrderId !== "string" ||
      !candidate.salesOrderId.trim() ||
      typeof candidate.orderNumber !== "string" ||
      !candidate.orderNumber.trim() ||
      candidate.currency !== "PEN" ||
      !isNonNegativeMoney(candidate.consumedPEN) ||
      !isNonNegativeMoney(candidate.refundedPEN) ||
      !isNonNegativeMoney(candidate.refundablePEN)
    ) {
      throw new Error("The API returned an invalid wallet-refund candidate.");
    }
  }
}

function isNonNegativeMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidRefundResponse(
  response: WalletRefundResponse,
  command: PendingRefund,
): boolean {
  return (
    !!response &&
    response.salesOrderId === command.salesOrderId &&
    typeof response.refundId === "string" &&
    !!response.refundId.trim() &&
    typeof response.ledgerEntryId === "string" &&
    !!response.ledgerEntryId.trim() &&
    response.amountPEN === command.request.amountPEN &&
    response.currency === "PEN" &&
    response.status === "POSTED"
  );
}

function isAmbiguousRefundError(error: unknown): boolean {
  if (!(error instanceof NexaApiError)) return true;
  return ["network", "timeout", "server", "unknown", "rate-limited"].includes(
    error.kind,
  );
}

function candidateLoadErrorMessage(error: unknown): string {
  if (error instanceof NexaApiError && error.kind === "forbidden") {
    return "The API denied wallet-refund candidates for this active Platform membership.";
  }
  if (error instanceof NexaApiError && error.kind === "server") {
    return "Wallet-refund candidates are unavailable in this business context. Try again later.";
  }
  return "Wallet-refund candidates could not be loaded. Try again.";
}

function refundErrorMessage(error: unknown): string {
  if (error instanceof NexaApiError && error.kind === "forbidden") {
    return "The API denied this refund for the active Platform membership.";
  }
  if (error instanceof NexaApiError && error.kind === "validation") {
    return "The API rejected the amount or reason. Review the refund details and try again.";
  }
  if (error instanceof NexaApiError && error.kind === "conflict") {
    return "The order is no longer refundable for this amount. Candidate data has been refreshed from the API.";
  }
  if (error instanceof NexaApiError && error.kind === "not-found") {
    return "This sales order is unavailable in the active business context. Candidate data has been refreshed from the API.";
  }
  return "The refund was not posted. Review the current API state before trying again.";
}
