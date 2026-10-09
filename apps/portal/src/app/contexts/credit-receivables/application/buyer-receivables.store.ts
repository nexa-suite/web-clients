import { computed, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import {
  NexaReceivablesApi,
  NexaApiError,
  type ReceivablesPageResponse,
} from "@nexa/api";
import {
  PortalSessionStore,
  type PortalSessionLease,
} from "../../tenant-access-governance/application/public-api";
interface Snapshot {
  readonly lease: PortalSessionLease;
  readonly data: ReceivablesPageResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
}
@Injectable({ providedIn: "root" })
export class BuyerReceivablesStore {
  private readonly api = inject(NexaReceivablesApi);
  private readonly session = inject(PortalSessionStore);
  private readonly snapshot = signal<Snapshot | null>(null);
  private revision = 0;
  readonly state = computed(() => {
    const value = this.snapshot();
    return value && this.session.isSessionLeaseCurrent(value.lease)
      ? value
      : null;
  });
  async load(page = 0): Promise<void> {
    const lease = this.session.captureSessionLease();
    const revision = ++this.revision;
    if (!lease) {
      this.snapshot.set(null);
      return;
    }
    this.snapshot.set({ lease, data: null, loading: true, error: null });
    try {
      const data = await firstValueFrom(this.api.list(page));
      if (
        revision !== this.revision ||
        !this.session.isSessionLeaseCurrent(lease)
      )
        return;
      this.snapshot.set({ lease, data, loading: false, error: null });
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
