import { computed, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import {
  NexaPaymentHistoryApi,
  NexaApiError,
  type PaymentHistoryPageResponse,
} from "@nexa/api";
import {
  PortalSessionStore,
  type PortalSessionLease,
} from "../../tenant-access-governance/application/public-api";
interface Snapshot {
  readonly lease: PortalSessionLease;
  readonly receivableId: string;
  readonly data: PaymentHistoryPageResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
}
@Injectable({ providedIn: "root" })
export class BuyerPaymentHistoryStore {
  private readonly api = inject(NexaPaymentHistoryApi);
  private readonly session = inject(PortalSessionStore);
  private readonly snapshot = signal<Snapshot | null>(null);
  private revision = 0;
  readonly state = computed(() => {
    const value = this.snapshot();
    return value && this.session.isSessionLeaseCurrent(value.lease)
      ? value
      : null;
  });
  async load(receivableId: string, page = 0): Promise<void> {
    const lease = this.session.captureSessionLease();
    const revision = ++this.revision;
    if (!lease) {
      this.snapshot.set(null);
      return;
    }
    this.snapshot.set({
      lease,
      receivableId,
      data: null,
      loading: true,
      error: null,
    });
    try {
      const data = await firstValueFrom(
        this.api.forReceivable(receivableId, page),
      );
      if (
        revision !== this.revision ||
        !this.session.isSessionLeaseCurrent(lease)
      )
        return;
      this.snapshot.set({
        lease,
        receivableId,
        data,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (
        revision !== this.revision ||
        !this.session.isSessionLeaseCurrent(lease)
      )
        return;
      if (error instanceof NexaApiError && error.kind === "unauthenticated")
        this.session.expireSessionIfCurrent(lease);
      if (
        error instanceof NexaApiError &&
        error.problem?.code === "ACCESS_CONTEXT_INVALID"
      )
        this.session.invalidateContextIfCurrent(lease);
      this.snapshot.set({
        lease,
        receivableId,
        data: null,
        loading: false,
        error: "Financial information could not be loaded. Try again.",
      });
    }
  }
  clear(): void {
    ++this.revision;
    this.snapshot.set(null);
  }
}
