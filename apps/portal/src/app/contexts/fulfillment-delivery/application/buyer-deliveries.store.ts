import { computed, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { NexaApiError, NexaBuyerDeliveriesApi, type BuyerDeliveryPageResponse, type BuyerDeliveryResponse, type BuyerDeliveryEventResponse } from "@nexa/api";
import { PortalSessionStore, type PortalSessionLease } from "../../tenant-access-governance/application/public-api";

interface DeliveryState {
  readonly lease: PortalSessionLease;
  readonly loading: boolean;
  readonly error: string | null;
  readonly page: BuyerDeliveryPageResponse | null;
  readonly detail: BuyerDeliveryResponse | null;
  readonly events: readonly BuyerDeliveryEventResponse[];
}

@Injectable({ providedIn: "root" })
export class BuyerDeliveriesStore {
  private readonly api = inject(NexaBuyerDeliveriesApi);
  private readonly session = inject(PortalSessionStore);
  private readonly snapshot = signal<DeliveryState | null>(null);
  private revision = 0;
  readonly state = computed(() => {
    const state = this.snapshot();
    return state && this.session.isSessionLeaseCurrent(state.lease) ? state : null;
  });
  async list(page = 0): Promise<void> { await this.load(null, Math.max(0, page)); }
  async detail(id: string): Promise<void> { await this.load(id, 0); }
  private async load(id: string | null, page: number): Promise<void> {
    const revision = ++this.revision;
    const lease = this.session.captureSessionLease();
    if (!lease) { this.snapshot.set(null); return; }
    const empty: DeliveryState = { lease, loading: true, error: null, page: null, detail: null, events: [] };
    this.snapshot.set(empty);
    try {
      const result = id
        ? await Promise.all([firstValueFrom(this.api.detail(id)), firstValueFrom(this.api.events(id))])
        : await firstValueFrom(this.api.list(page));
      if (revision !== this.revision || !this.session.isSessionLeaseCurrent(lease)) return;
      this.snapshot.set(Array.isArray(result)
        ? { ...empty, loading: false, detail: result[0], events: result[1] }
        : { ...empty, loading: false, page: result });
    } catch (error) {
      if (revision !== this.revision || !this.session.isSessionLeaseCurrent(lease)) return;
      if (error instanceof NexaApiError && error.kind === "unauthenticated") this.session.expireSessionIfCurrent(lease);
      if (error instanceof NexaApiError && error.problem?.code === "ACCESS_CONTEXT_INVALID") this.session.invalidateContextIfCurrent(lease);
      this.snapshot.set({ ...empty, loading: false, error: "Delivery information could not be loaded. Refresh with a current Buyer context." });
    }
  }
}
