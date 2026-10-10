import { computed, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import {
  NexaApiError,
  NexaCommandRetryStore,
  NexaBuyerWalletApi,
  type BuyerWalletRechargeCreatedResponse,
  type BuyerWalletRechargeStatusResponse,
  type BuyerWalletResponse,
} from "@nexa/api";
import {
  PortalSessionStore,
  type PortalSessionLease,
} from "../../tenant-access-governance/application/public-api";
import type { BuyerWalletCapabilitiesPort } from "./buyer-wallet-capabilities.port";

export type BuyerWalletState =
  | {
      readonly status: "loading";
      readonly lease: PortalSessionLease;
    }
  | {
      readonly status: "ready";
      readonly lease: PortalSessionLease;
      readonly wallet: BuyerWalletResponse;
    }
  | {
      readonly status: "unavailable";
      readonly lease: PortalSessionLease;
      readonly message: string;
    }
  | {
      readonly status: "error";
      readonly lease: PortalSessionLease;
      readonly message: string;
    };

type BuyerWalletRechargeView = Omit<
  BuyerWalletRechargeStatusResponse,
  "updatedAt" | "completedAt"
>;

export type BuyerWalletRechargeWorkflowState =
  | {
      readonly status: "creating";
      readonly lease: PortalSessionLease;
      readonly amount: number;
    }
  | {
      readonly status: "pending" | "final";
      readonly lease: PortalSessionLease;
      readonly recharge: BuyerWalletRechargeView;
    }
  | {
      readonly status: "error";
      readonly lease: PortalSessionLease;
      readonly operation: "create" | "read";
      readonly amount: number;
      readonly message: string;
      readonly retryAllowed: boolean;
    };

const RECHARGE_RETRY_PREFIX = "nexa:buyer:wallet-recharge:";
const RECHARGE_PENDING_PREFIX = "nexa:buyer:wallet-recharge-pending:";
const RECHARGE_STATUS_PREFIX = "nexa:buyer:wallet-recharge-status:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable({ providedIn: "root" })
export class BuyerWalletStore implements BuyerWalletCapabilitiesPort {
  private readonly api = inject(NexaBuyerWalletApi);
  private readonly session = inject(PortalSessionStore);
  private readonly retries = inject(NexaCommandRetryStore);
  private readonly snapshot = signal<BuyerWalletState | null>(null);
  private readonly rechargeSnapshot = signal<BuyerWalletRechargeWorkflowState | null>(null);
  private revision = 0;
  private rechargeRevision = 0;

  readonly canRead = computed(() => {
    const current = this.session.state();
    return (
      current.status === "authenticated" &&
      current.session.surface === "PORTAL" &&
      (current.session.membership?.roles ?? []).includes("BUYER") &&
      (current.session.membership?.permissions ?? []).includes("payment.read")
    );
  });
  readonly canRecharge = computed(() => {
    const current = this.session.state();
    return current.status === "authenticated" &&
      current.session.surface === "PORTAL" &&
      (current.session.membership?.roles ?? []).includes("BUYER") &&
      (current.session.membership?.permissions ?? []).includes("payment.create");
  });
  readonly orderPaymentSupported = computed(() => {
    const current = this.state();
    return current?.status === "ready"
      && current.wallet.status === "ACTIVE"
      && current.wallet.capabilities?.orderPaymentSupported === true;
  });
  readonly state = computed(() => {
    const current = this.snapshot();
    return current &&
      this.canRead() &&
      this.session.isSessionLeaseCurrent(current.lease)
      ? current
      : null;
  });
  readonly rechargeState = computed(() => {
    const current = this.rechargeSnapshot();
    return current && this.session.isSessionLeaseCurrent(current.lease)
      ? current
      : null;
  });

  async load(page = 0): Promise<void> {
    const lease = this.session.captureSessionLease();
    const revision = ++this.revision;
    if (!lease || !this.canRead()) {
      this.snapshot.set(null);
      return;
    }
    this.snapshot.set({ status: "loading", lease });
    try {
      const wallet = await firstValueFrom(this.api.read(page));
      if (
        revision !== this.revision ||
        !this.session.isSessionLeaseCurrent(lease) ||
        !this.canRead()
      ) {
        return;
      }
      this.snapshot.set({ status: "ready", lease, wallet });
    } catch (error) {
      if (
        revision !== this.revision ||
        !this.session.isSessionLeaseCurrent(lease)
      ) {
        return;
      }
      if (error instanceof NexaApiError && error.kind === "unauthenticated") {
        this.session.expireSessionIfCurrent(lease);
        return;
      }
      if (
        error instanceof NexaApiError &&
        error.problem?.code === "ACCESS_CONTEXT_INVALID"
      ) {
        this.session.invalidateContextIfCurrent(lease);
        return;
      }
      if (
        error instanceof NexaApiError &&
        (error.status === 503 ||
          error.problem?.code === "TECHNICAL_CAPABILITY_UNAVAILABLE")
      ) {
        this.snapshot.set({
          status: "unavailable",
          lease,
          message: "Wallet reading is currently unavailable. Try again later.",
        });
        return;
      }
      this.snapshot.set({
        status: "error",
        lease,
        message:
          error instanceof NexaApiError && error.kind === "forbidden"
            ? "The API denied wallet access for the active context."
            : "Wallet information could not be loaded. Try again.",
      });
    }
  }

  async loadCapabilities(): Promise<void> {
    if (!this.canRead()) {
      this.clear();
      return;
    }
    await this.load(0);
  }

  async loadLastRecharge(): Promise<void> {
    const lease = this.session.captureSessionLease();
    if (!lease) return;
    const uncertainCommand = this.retries.read(rechargePendingStorageKey(lease));
    const pending = parsePendingRecharge(uncertainCommand);
    if (pending) {
      this.rechargeSnapshot.set({
        status: "error",
        lease,
        operation: "create",
        amount: pending.amount,
        message: "A previous recharge result is uncertain. Retry that same amount with its original command key before starting another recharge.",
        retryAllowed: true,
      });
      return;
    }
    const id = this.retries.read(rechargeStatusStorageKey(lease));
    if (!id || !UUID_PATTERN.test(id)) return;
    if (!this.canRead()) {
      this.rechargeSnapshot.set({
        status: "error",
        lease,
        operation: "read",
        amount: 0,
        message: "A previous recharge exists, but payment.read is required to check its current status before starting another recharge.",
        retryAllowed: false,
      });
      return;
    }
    await this.readRechargeStatus(id);
  }

  async createRecharge(amount: number): Promise<BuyerWalletRechargeCreatedResponse | null> {
    const lease = this.session.captureSessionLease();
    if (!lease || !this.canRecharge()) return null;
    if (!isValidRechargeAmount(amount)) {
      this.rechargeSnapshot.set({
        status: "error",
        lease,
        operation: "create",
        amount,
        message: "Enter a positive amount in PEN with no more than two decimals.",
        retryAllowed: false,
      });
      return null;
    }
    const prior = this.rechargeState();
    if (prior?.status === "creating" || prior?.status === "pending" ||
        (prior?.status === "error" && (prior.operation === "read" || prior.retryAllowed))) return null;

    const revision = ++this.rechargeRevision;
    const normalizedAmount = Number(amount.toFixed(2));
    this.rechargeSnapshot.set({ status: "creating", lease, amount: normalizedAmount });
    let retryStorageKey: string | null = null;
    let commandIdempotencyKey: string | null = null;
    try {
      const cryptoApi = globalThis.crypto;
      if (!cryptoApi?.subtle?.digest || !cryptoApi.randomUUID) {
        throw new Error("Secure command identity is unavailable.");
      }
      const digest = await cryptoApi.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify({ amount: normalizedAmount.toFixed(2) })),
      );
      if (!this.isCurrentRecharge(revision, lease, "create")) return null;
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const pendingMarker = parsePendingRecharge(this.retries.read(rechargePendingStorageKey(lease)));
      if (pendingMarker && pendingMarker.fingerprint !== fingerprint) {
        this.rechargeSnapshot.set({
          status: "error",
          lease,
          operation: "create",
          amount: pendingMarker.amount,
          message: "A different recharge result is still uncertain. Retry its original amount and command key before starting another recharge.",
          retryAllowed: true,
        });
        return null;
      }
      retryStorageKey = rechargeRetryStorageKey(lease, fingerprint);
      const idempotencyKey = pendingMarker?.idempotencyKey ?? this.retries.read(retryStorageKey) ?? cryptoApi.randomUUID();
      commandIdempotencyKey = idempotencyKey;
      this.retries.write(retryStorageKey, idempotencyKey);
      this.retries.write(
        rechargePendingStorageKey(lease),
        JSON.stringify({ amount: normalizedAmount, fingerprint, idempotencyKey }),
      );

      const intent = await firstValueFrom(this.api.createRecharge(normalizedAmount, idempotencyKey));
      if (!this.isCurrentRecharge(revision, lease, "create")) return null;
      if (!UUID_PATTERN.test(intent.id)) throw new Error("The API returned an invalid recharge identity.");
      this.rememberRechargeId(lease, intent.id);
      this.retries.remove(retryStorageKey);
      this.removePendingRechargeMarker(lease, idempotencyKey);
      this.rechargeSnapshot.set({
        status: isFinalStatus(intent.status) ? "final" : "pending",
        lease,
        recharge: toRechargeView(intent),
      });
      if (intent.status === "SUCCEEDED") await this.load(this.currentWalletPage());
      return intent;
    } catch (error) {
      if (!this.isCurrentRecharge(revision, lease, "create")) return null;
      this.handleSessionFailure(error, lease);
      const knownRejection = error instanceof NexaApiError &&
        (error.kind === "validation" || error.kind === "forbidden" || error.kind === "not-found");
      if (knownRejection && retryStorageKey) {
        this.retries.remove(retryStorageKey);
        if (commandIdempotencyKey) this.removePendingRechargeMarker(lease, commandIdempotencyKey);
      }
      this.rechargeSnapshot.set({
        status: "error",
        lease,
        operation: "create",
        amount: normalizedAmount,
        message: retryStorageKey === null
          ? "Secure browser support is unavailable; no recharge request was sent. Use a supported browser."
          : knownRejection
          ? "The API did not accept this recharge. Refresh wallet access and review the amount before trying again."
          : "Recharge result is uncertain. Retry this same amount to reuse its idempotency key, or check the latest recharge status.",
        retryAllowed: !knownRejection && retryStorageKey !== null,
      });
      return null;
    }
  }

  async retryRecharge(): Promise<BuyerWalletRechargeCreatedResponse | null> {
    const current = this.rechargeState();
    if (!current || current.status !== "error" || current.operation !== "create" || !current.retryAllowed) return null;
    // Clear only the UI error; the scoped retry key remains so the same amount
    // reuses the original command identity if the prior response was lost.
    this.rechargeSnapshot.set(null);
    return this.createRecharge(current.amount);
  }

  async readRechargeStatus(rechargeId?: string): Promise<void> {
    const lease = this.session.captureSessionLease();
    if (!lease || !this.canRead()) return;
    const id = rechargeId?.trim() || this.retries.read(rechargeStatusStorageKey(lease));
    if (!id || !UUID_PATTERN.test(id)) return;
    const revision = ++this.rechargeRevision;
    try {
      const recharge = await firstValueFrom(this.api.readRecharge(id));
      if (!this.isCurrentRecharge(revision, lease, "read")) return;
      this.rememberRechargeId(lease, recharge.id);
      this.rechargeSnapshot.set({
        status: isFinalStatus(recharge.status) ? "final" : "pending",
        lease,
        recharge,
      });
      if (recharge.status === "SUCCEEDED") await this.load(this.currentWalletPage());
    } catch (error) {
      if (!this.isCurrentRecharge(revision, lease, "read")) return;
      this.handleSessionFailure(error, lease);
      const previous = this.rechargeState();
      const amount = previous?.status === "pending" || previous?.status === "final"
        ? previous.recharge.amount
        : 0;
      this.rechargeSnapshot.set({
        status: "error",
        lease,
        operation: "read",
        amount,
        message: "Recharge status could not be refreshed. Wallet balance remains API-authoritative.",
        retryAllowed: false,
      });
    }
  }

  clear(): void {
    ++this.revision;
    this.snapshot.set(null);
    ++this.rechargeRevision;
    this.rechargeSnapshot.set(null);
  }

  private isCurrentRecharge(revision: number, lease: PortalSessionLease, operation: "create" | "read"): boolean {
    const allowed = operation === "create" ? this.canRecharge() : this.canRead();
    return revision === this.rechargeRevision && this.session.isSessionLeaseCurrent(lease) && allowed;
  }

  private rememberRechargeId(lease: PortalSessionLease, rechargeId: string): void {
    if (UUID_PATTERN.test(rechargeId)) {
      this.retries.write(rechargeStatusStorageKey(lease), rechargeId);
    }
  }

  private removePendingRechargeMarker(lease: PortalSessionLease, idempotencyKey: string): void {
    const key = rechargePendingStorageKey(lease);
    const pending = parsePendingRecharge(this.retries.read(key));
    if (pending?.idempotencyKey === idempotencyKey) this.retries.remove(key);
  }

  private currentWalletPage(): number {
    const current = this.snapshot();
    return current?.status === "ready" && this.session.isSessionLeaseCurrent(current.lease)
      ? current.wallet.movements.page
      : 0;
  }

  private handleSessionFailure(error: unknown, lease: PortalSessionLease): void {
    if (error instanceof NexaApiError && error.kind === "unauthenticated") {
      this.session.expireSessionIfCurrent(lease);
    }
    if (error instanceof NexaApiError && error.problem?.code === "ACCESS_CONTEXT_INVALID") {
      this.session.invalidateContextIfCurrent(lease);
    }
  }
}

function isValidRechargeAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && Math.round(amount * 100) / 100 === amount;
}

function isFinalStatus(status: BuyerWalletRechargeStatusResponse["status"]): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED" || status === "REJECTED";
}

function rechargeRetryStorageKey(lease: PortalSessionLease, fingerprint: string): string {
  const { userId, tenantId, workspaceId, membershipId } = lease.scope;
  return RECHARGE_RETRY_PREFIX + [userId, tenantId, workspaceId, membershipId, fingerprint].map(encodeURIComponent).join(":");
}

function rechargePendingStorageKey(lease: PortalSessionLease): string {
  const { userId, tenantId, workspaceId, membershipId } = lease.scope;
  return RECHARGE_PENDING_PREFIX + [userId, tenantId, workspaceId, membershipId].map(encodeURIComponent).join(":");
}

function rechargeStatusStorageKey(lease: PortalSessionLease): string {
  const { userId, tenantId, workspaceId, membershipId } = lease.scope;
  return RECHARGE_STATUS_PREFIX + [userId, tenantId, workspaceId, membershipId].map(encodeURIComponent).join(":");
}

function toRechargeView(intent: BuyerWalletRechargeCreatedResponse): BuyerWalletRechargeView {
  return {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    provider: intent.provider,
    providerPaymentIntentId: intent.providerPaymentIntentId,
    createdAt: intent.createdAt,
  };
}

function parsePendingRecharge(value: string | null): {
  readonly amount: number;
  readonly fingerprint: string;
  readonly idempotencyKey: string;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      readonly amount?: unknown;
      readonly fingerprint?: unknown;
      readonly idempotencyKey?: unknown;
    };
    if (
      typeof parsed.amount !== "number" || !isValidRechargeAmount(parsed.amount) ||
      typeof parsed.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(parsed.fingerprint) ||
      typeof parsed.idempotencyKey !== "string" || !UUID_PATTERN.test(parsed.idempotencyKey)
    ) return null;
    return { amount: parsed.amount, fingerprint: parsed.fingerprint, idempotencyKey: parsed.idempotencyKey };
  } catch {
    return null;
  }
}
