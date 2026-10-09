import { computed, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { NexaApiError, NexaCommandRetryStore, NexaPaymentCommandsApi, type PaymentResponse } from "@nexa/api";
import { PortalSessionStore, type PortalSessionLease } from "../../tenant-access-governance/application/public-api";

interface ReportState {
  readonly lease: PortalSessionLease;
  readonly receivableId: string;
  readonly reference: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly payment: PaymentResponse | null;
}

@Injectable({ providedIn: "root" })
export class BuyerBankTransferStore {
  private readonly api = inject(NexaPaymentCommandsApi);
  private readonly session = inject(PortalSessionStore);
  private readonly retries = inject(NexaCommandRetryStore);
  private readonly snapshot = signal<ReportState | null>(null);
  readonly state = computed(() => {
    const value = this.snapshot();
    return value && this.session.isSessionLeaseCurrent(value.lease) ? value : null;
  });
  readonly canReport = computed(() => {
    const current = this.session.state();
    return current.status === "authenticated" &&
      (current.session.membership?.permissions ?? []).includes("payment.create");
  });

  select(receivableId: string): void {
    if (this.state()?.busy || !this.canReport()) return;
    const lease = this.session.captureSessionLease();
    this.snapshot.set(lease && receivableId.trim()
      ? { lease, receivableId, reference: "", busy: false, error: null, payment: null }
      : null);
  }
  editReference(reference: string): void {
    const state = this.state();
    if (state && !state.busy && !state.payment) this.snapshot.set({ ...state, reference, error: null });
  }
  clear(): void {
    if (!this.state()?.busy) this.snapshot.set(null);
  }

  async submit(): Promise<void> {
    const state = this.state();
    if (!state || state.busy || state.payment || !this.canReport()) return;
    const reference = state.reference.trim();
    if (!reference || reference.length > 160) {
      this.snapshot.set({ ...state, error: "Enter the bank transfer reference (up to 160 characters)." });
      return;
    }
    this.snapshot.set({ ...state, busy: true, error: null });
    let dispatched = false;
    try {
      // Only a fingerprint and retry UUID are persisted, never financial evidence.
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ reference, proofEvidenceId: null })));
      const fingerprint = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!this.session.isSessionLeaseCurrent(state.lease)) return;
      if (!this.canReport()) {
        this.snapshot.set({ ...state, busy: false, error: "Payment reporting permission is no longer available." });
        return;
      }
      const scope = state.lease.scope;
      const storageKey = "nexa:buyer:bank-transfer:" + [scope.userId, scope.tenantId, scope.workspaceId, scope.membershipId, state.receivableId, fingerprint].map(encodeURIComponent).join(":");
      const key = this.retries.read(storageKey) ?? crypto.randomUUID();
      this.retries.write(storageKey, key);
      dispatched = true;
      const payment = await firstValueFrom(this.api.reportBankTransfer(state.receivableId, { reference, proofEvidenceId: null }, key));
      if (!this.session.isSessionLeaseCurrent(state.lease)) return;
      // A reported transfer is not a confirmed payment or a wallet recharge.
      this.snapshot.set({ ...state, reference: "", busy: false, error: null, payment });
    } catch (error) {
      if (!this.session.isSessionLeaseCurrent(state.lease)) return;
      if (error instanceof NexaApiError && error.kind === "unauthenticated") this.session.expireSessionIfCurrent(state.lease);
      if (error instanceof NexaApiError && error.problem?.code === "ACCESS_CONTEXT_INVALID") this.session.invalidateContextIfCurrent(state.lease);
      this.snapshot.set({ ...state, busy: false, error:
        !dispatched ? "This browser could not prepare a safe transfer report. No report was sent."
        : error instanceof NexaApiError && (error.kind === "validation" || error.kind === "forbidden")
          ? "This transfer could not be reported. Refresh the receivable and check your permission and reference."
          : "The result is uncertain. Check payment history, then retry with the same reference if needed.",
      });
    }
  }
}
