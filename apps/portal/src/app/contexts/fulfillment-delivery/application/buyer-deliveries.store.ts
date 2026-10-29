import { computed, inject, Injectable, signal } from "@angular/core";
import { Observable, catchError, firstValueFrom, forkJoin, map, of, switchMap, tap, throwError } from "rxjs";
import { NexaApiError, NexaBuyerDeliveriesApi, type BuyerDeliveryPageResponse, type BuyerDeliveryResponse, type BuyerDeliveryEventResponse, type BuyerDeliveryLocationSample } from "@nexa/api";
import { PortalSessionStore, type PortalSessionLease } from "../../tenant-access-governance/application/public-api";

interface DeliveryState {
  readonly lease: PortalSessionLease;
  readonly loading: boolean;
  readonly error: string | null;
  readonly page: BuyerDeliveryPageResponse | null;
  readonly deliveryId: string | null;
  readonly detail: BuyerDeliveryResponse | null;
  readonly events: readonly BuyerDeliveryEventResponse[];
  readonly liveLocation: BuyerDeliveryLocationSample | null;
  readonly liveTrackingTerminal: boolean;
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

  refreshListForPolling(lease: PortalSessionLease): Observable<boolean> {
    const currentState = this.snapshot();
    if (!currentState || !this.isCurrent(currentState, lease)) return of(false);
    const pageIndex = currentState.page?.page ?? 0;
    const revision = ++this.revision;
    return this.api.list(pageIndex).pipe(
      tap((page) => {
        if (!this.isRequestCurrent(revision, currentState, lease)) return;
        this.snapshot.update((state) => state ? { ...state, loading: false, error: null, page } : state);
      }),
      map(() => this.isRequestCurrent(revision, currentState, lease)),
      catchError((error: unknown) => {
        if (!this.isRequestCurrent(revision, currentState, lease)) return of(false);
        return of(this.handlePollingError(error, lease));
      }),
    );
  }

  refreshDetailForPolling(id: string, lease: PortalSessionLease): Observable<boolean> {
    const currentState = this.snapshot();
    if (!currentState) return of(false);
    if (currentState.loading) return of(true);
    if (!this.isCurrent(currentState, lease) || currentState.deliveryId !== id) return of(false);
    const revision = ++this.revision;
    return forkJoin({ detail: this.api.detail(id), events: this.api.events(id) }).pipe(
      switchMap(({ detail, events }) => {
        const becameTerminal = isActiveDelivery(currentState.detail?.status) && !isActiveDelivery(detail.status);
        const trackingTerminal = currentState.liveTrackingTerminal || becameTerminal;
        if (!isActiveDelivery(detail.status) || trackingTerminal) {
          return of({ detail, events, location: null, trackingTerminal });
        }
        return this.api.liveLocation(id).pipe(
          map((tracking) => ({
            detail,
            events,
            location: tracking.deliveryId === id ? unexpiredLocation(tracking.location) : null,
            trackingTerminal: tracking.deliveryId !== id,
          })),
          catchError((error: unknown) => isNotFound(error)
            ? of({ detail, events, location: null, trackingTerminal: true })
            : throwError(() => error)),
        );
      }),
      tap(({ detail, events, location, trackingTerminal }) => {
        if (!this.isRequestCurrent(revision, currentState, lease)) return;
        this.snapshot.update((state) => state ? {
          ...state,
          loading: false,
          error: null,
          detail,
          events,
          liveLocation: location,
          liveTrackingTerminal: trackingTerminal,
        } : state);
      }),
      map(() => this.isRequestCurrent(revision, currentState, lease)),
      catchError((error: unknown) => {
        if (!this.isRequestCurrent(revision, currentState, lease)) return of(false);
        return of(this.handlePollingError(error, lease));
      }),
    );
  }

  clearDeliveryState(deliveryId: string): void {
    const current = this.snapshot();
    if (current?.deliveryId !== deliveryId) return;
    this.revision += 1;
    this.snapshot.set(null);
  }

  clearForStaleScope(lease: PortalSessionLease): void {
    const current = this.snapshot();
    if (!current || current.lease.epoch !== lease.epoch || this.session.isSessionLeaseCurrent(lease)) return;
    this.revision += 1;
    this.snapshot.set(null);
  }

  private async load(id: string | null, page: number): Promise<void> {
    const revision = ++this.revision;
    const lease = this.session.captureSessionLease();
    if (!lease) { this.snapshot.set(null); return; }
    const empty: DeliveryState = {
      lease,
      loading: true,
      error: null,
      page: null,
      deliveryId: id,
      detail: null,
      events: [],
      liveLocation: null,
      liveTrackingTerminal: false,
    };
    this.snapshot.set(empty);
    try {
      if (id) {
        const [detail, events] = await Promise.all([
          firstValueFrom(this.api.detail(id)),
          firstValueFrom(this.api.events(id)),
        ]);
        const tracking = await this.readLiveLocation(id, detail);
        if (revision !== this.revision || !this.session.isSessionLeaseCurrent(lease)) return;
        this.snapshot.set({
          ...empty,
          loading: false,
          detail,
          events,
          liveLocation: tracking.location,
          liveTrackingTerminal: tracking.terminal,
        });
      } else {
        const pageResult = await firstValueFrom(this.api.list(page));
        if (revision !== this.revision || !this.session.isSessionLeaseCurrent(lease)) return;
        this.snapshot.set({ ...empty, loading: false, page: pageResult });
      }
    } catch (error) {
      if (revision !== this.revision || !this.session.isSessionLeaseCurrent(lease)) return;
      if (error instanceof NexaApiError && error.kind === "unauthenticated") this.session.expireSessionIfCurrent(lease);
      if (error instanceof NexaApiError && error.problem?.code === "ACCESS_CONTEXT_INVALID") this.session.invalidateContextIfCurrent(lease);
      this.snapshot.set({ ...empty, loading: false, error: "Delivery information could not be loaded. Refresh with a current Buyer context." });
    }
  }

  private async readLiveLocation(
    id: string,
    detail: BuyerDeliveryResponse,
  ): Promise<{ readonly location: BuyerDeliveryLocationSample | null; readonly terminal: boolean }> {
    if (!isActiveDelivery(detail.status)) return { location: null, terminal: false };
    try {
      const response = await firstValueFrom(this.api.liveLocation(id));
      if (response.deliveryId !== id) return { location: null, terminal: true };
      return { location: unexpiredLocation(response.location), terminal: false };
    } catch (error) {
      if (isNotFound(error)) return { location: null, terminal: true };
      throw error;
    }
  }

  private handlePollingError(error: unknown, lease: PortalSessionLease): boolean {
    if (!(error instanceof NexaApiError)) return true;
    if (error.status === 404) {
      this.snapshot.update((state) => state ? {
        ...state,
        loading: false,
        error: "This delivery is no longer available in the current Buyer context.",
        page: null,
        deliveryId: null,
        detail: null,
        events: [],
        liveLocation: null,
        liveTrackingTerminal: true,
      } : null);
      return false;
    }
    if (error.kind !== "unauthenticated" && error.kind !== "forbidden") return true;
    if (error.kind === "unauthenticated") {
      this.session.expireSessionIfCurrent(lease);
      this.snapshot.set(null);
    } else if (error.problem?.code === "ACCESS_CONTEXT_INVALID") {
      this.session.invalidateContextIfCurrent(lease);
      this.snapshot.set(null);
    } else {
      this.snapshot.update((state) => state ? {
        ...state,
        loading: false,
        error: "Your current Buyer membership cannot read delivery information.",
        page: null,
        deliveryId: null,
        detail: null,
        events: [],
        liveLocation: null,
        liveTrackingTerminal: true,
      } : null);
    }
    return false;
  }

  private isCurrent(state: DeliveryState, lease: PortalSessionLease): boolean {
    return state.lease.epoch === lease.epoch && this.session.isSessionLeaseCurrent(lease);
  }

  private isRequestCurrent(revision: number, state: DeliveryState, lease: PortalSessionLease): boolean {
    return revision === this.revision && this.isCurrent(state, lease);
  }
}

function isActiveDelivery(status: string | undefined): boolean {
  return status === "DISPATCHED" || status === "IN_TRANSIT";
}

function isNotFound(error: unknown): boolean {
  return error instanceof NexaApiError && error.status === 404;
}

function unexpiredLocation(location: BuyerDeliveryLocationSample | null): BuyerDeliveryLocationSample | null {
  if (!location) return null;
  const expiresAt = Date.parse(location.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now() ? location : null;
}
