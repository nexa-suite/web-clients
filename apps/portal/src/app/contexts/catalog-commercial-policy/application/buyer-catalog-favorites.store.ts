import { computed, effect, inject, Injectable, signal } from "@angular/core";
import {
  NexaApiError,
  NexaBuyerCatalogFavoritesApi,
} from "@nexa/api";
import type {
  BuyerCatalogFavoriteResponse,
  BuyerCatalogFavoritePageResponse,
} from "@nexa/api";
import { firstValueFrom } from "rxjs";
import {
  PortalSessionStore,
  type PortalSessionLease,
} from "../../tenant-access-governance/application/public-api";

export interface BuyerCatalogFavoritesState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly items: readonly BuyerCatalogFavoriteResponse[];
  readonly pendingSkuIds: ReadonlySet<string>;
  readonly errorMessage: string | null;
  readonly actionError: string | null;
}

interface ScopedFavorites {
  readonly lease: PortalSessionLease;
  readonly state: BuyerCatalogFavoritesState;
}

const EMPTY_STATE: BuyerCatalogFavoritesState = {
  status: "idle",
  items: [],
  pendingSkuIds: new Set<string>(),
  errorMessage: null,
  actionError: null,
};

const PAGE_SIZE = 100;

@Injectable({ providedIn: "root" })
export class BuyerCatalogFavoritesStore {
  private readonly api = inject(NexaBuyerCatalogFavoritesApi);
  private readonly sessions = inject(PortalSessionStore);
  private readonly snapshot = signal<ScopedFavorites | null>(null);
  private revision = 0;

  readonly state = computed(() => {
    const snapshot = this.snapshot();
    return snapshot && this.sessions.isSessionLeaseCurrent(snapshot.lease)
      ? snapshot.state
      : EMPTY_STATE;
  });

  constructor() {
    effect(() => {
      this.sessions.state();
      const lease = this.sessions.captureSessionLease();
      const snapshot = this.snapshot();
      if (
        !lease ||
        (snapshot && !this.sessions.isSessionLeaseCurrent(snapshot.lease))
      ) {
        this.revision += 1;
        this.snapshot.set(null);
      }
    });
  }

  async load(force = false): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease) {
      this.clear();
      return;
    }

    const current = this.currentState(lease);
    if (!force && (current?.status === "ready" || current?.status === "loading")) {
      return;
    }

    const revision = ++this.revision;
    this.write(
      {
        status: "loading",
        items: current?.items ?? [],
        pendingSkuIds: new Set<string>(),
        errorMessage: null,
        actionError: null,
      },
      lease,
    );

    try {
      const items = await this.loadAllPages();
      if (!this.isCurrent(revision, lease)) return;
      this.write(
        {
          status: "ready",
          items,
          pendingSkuIds: new Set<string>(),
          errorMessage: null,
          actionError: null,
        },
        lease,
      );
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease)) return;
      this.handleSessionError(error, lease);
      if (!this.sessions.isSessionLeaseCurrent(lease)) {
        this.clear();
        return;
      }
      this.write(
        {
          status: "error",
          items: [],
          pendingSkuIds: new Set<string>(),
          errorMessage: favoritesLoadError(error),
          actionError: null,
        },
        lease,
      );
    }
  }

  isFavorite(sellableSkuId: string | null | undefined): boolean {
    return Boolean(
      sellableSkuId &&
        this.state().items.some(
          (favorite) => favorite.sellableSkuId === sellableSkuId,
        ),
    );
  }

  isPending(sellableSkuId: string | null | undefined): boolean {
    return Boolean(sellableSkuId && this.state().pendingSkuIds.has(sellableSkuId));
  }

  async add(sellableSkuId: string | null | undefined): Promise<void> {
    if (!sellableSkuId) return;
    const lease = this.sessions.captureSessionLease();
    const current = lease ? this.currentState(lease) : null;
    if (
      !lease ||
      current?.status !== "ready" ||
      current.pendingSkuIds.has(sellableSkuId)
    ) {
      return;
    }

    const revision = this.revision;
    this.setPending(sellableSkuId, true, lease);
    try {
      const favorite = await firstValueFrom(this.api.add(sellableSkuId));
      if (!this.isCurrent(revision, lease)) return;
      if (!isValidFavorite(favorite) || favorite.sellableSkuId !== sellableSkuId) {
        throw new NexaApiError("unknown", null, null);
      }
      this.updateReadyState(lease, (state) => ({
        ...state,
        items: upsertFavorite(state.items, favorite),
        pendingSkuIds: without(state.pendingSkuIds, sellableSkuId),
        actionError: null,
      }));
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease)) return;
      this.handleSessionError(error, lease);
      if (!this.sessions.isSessionLeaseCurrent(lease)) {
        this.clear();
        return;
      }
      this.updateReadyState(lease, (state) => ({
        ...state,
        pendingSkuIds: without(state.pendingSkuIds, sellableSkuId),
        actionError: favoritesActionError(error),
      }));
    }
  }

  async remove(sellableSkuId: string): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    const current = lease ? this.currentState(lease) : null;
    if (
      !lease ||
      current?.status !== "ready" ||
      current.pendingSkuIds.has(sellableSkuId)
    ) {
      return;
    }

    const revision = this.revision;
    this.setPending(sellableSkuId, true, lease);
    try {
      await firstValueFrom(this.api.remove(sellableSkuId));
      if (!this.isCurrent(revision, lease)) return;
      this.updateReadyState(lease, (state) => ({
        ...state,
        items: state.items.filter(
          (favorite) => favorite.sellableSkuId !== sellableSkuId,
        ),
        pendingSkuIds: without(state.pendingSkuIds, sellableSkuId),
        actionError: null,
      }));
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease)) return;
      this.handleSessionError(error, lease);
      if (!this.sessions.isSessionLeaseCurrent(lease)) {
        this.clear();
        return;
      }
      this.updateReadyState(lease, (state) => ({
        ...state,
        pendingSkuIds: without(state.pendingSkuIds, sellableSkuId),
        actionError: favoritesActionError(error),
      }));
    }
  }

  clearActionError(): void {
    this.snapshot.update((snapshot) =>
      snapshot && this.sessions.isSessionLeaseCurrent(snapshot.lease)
        ? {
            ...snapshot,
            state: { ...snapshot.state, actionError: null },
          }
        : snapshot,
    );
  }

  private async loadAllPages(): Promise<readonly BuyerCatalogFavoriteResponse[]> {
    const items: BuyerCatalogFavoriteResponse[] = [];
    const identifiers = new Set<string>();
    let expectedTotal: number | null = null;
    let expectedPages: number | null = null;
    let page = 0;

    while (expectedPages === null || page < expectedPages) {
      const response = await firstValueFrom(
        this.api.list({ page, size: PAGE_SIZE }),
      );
      if (!isValidPage(response, page, PAGE_SIZE)) {
        throw new NexaApiError("unknown", null, null);
      }
      if (expectedTotal === null) {
        expectedTotal = response.totalItems;
        expectedPages = response.totalPages;
      } else if (
        response.totalItems !== expectedTotal ||
        response.totalPages !== expectedPages
      ) {
        throw new NexaApiError("unknown", null, null);
      }
      if (response.items.length === 0 && items.length < response.totalItems) {
        throw new NexaApiError("unknown", null, null);
      }
      for (const favorite of response.items) {
        if (identifiers.has(favorite.sellableSkuId)) {
          throw new NexaApiError("unknown", null, null);
        }
        identifiers.add(favorite.sellableSkuId);
        items.push(favorite);
      }
      page += 1;
    }

    if (items.length !== expectedTotal) {
      throw new NexaApiError("unknown", null, null);
    }
    return items;
  }

  private setPending(
    sellableSkuId: string,
    pending: boolean,
    lease: PortalSessionLease,
  ): void {
    this.updateReadyState(lease, (state) => ({
      ...state,
      pendingSkuIds: pending
        ? addToSet(state.pendingSkuIds, sellableSkuId)
        : without(state.pendingSkuIds, sellableSkuId),
      actionError: null,
    }));
  }

  private updateReadyState(
    lease: PortalSessionLease,
    update: (state: BuyerCatalogFavoritesState) => BuyerCatalogFavoritesState,
  ): void {
    this.snapshot.update((snapshot) =>
      snapshot &&
      this.sessions.isSessionLeaseCurrent(snapshot.lease) &&
      sameLease(snapshot.lease, lease) &&
      snapshot.state.status === "ready"
        ? { ...snapshot, state: update(snapshot.state) }
        : snapshot,
    );
  }

  private currentState(lease: PortalSessionLease): BuyerCatalogFavoritesState | null {
    const snapshot = this.snapshot();
    return snapshot &&
      sameLease(snapshot.lease, lease) &&
      this.sessions.isSessionLeaseCurrent(snapshot.lease)
      ? snapshot.state
      : null;
  }

  private isCurrent(revision: number, lease: PortalSessionLease): boolean {
    return revision === this.revision && this.sessions.isSessionLeaseCurrent(lease);
  }

  private write(state: BuyerCatalogFavoritesState, lease: PortalSessionLease): void {
    this.snapshot.set({ lease, state });
  }

  private clear(): void {
    this.revision += 1;
    this.snapshot.set(null);
  }

  private handleSessionError(error: unknown, lease: PortalSessionLease): void {
    if (!(error instanceof NexaApiError)) return;
    if (error.kind === "unauthenticated") {
      this.sessions.expireSessionIfCurrent(lease);
    } else if (
      error.kind === "forbidden" &&
      error.problem?.code === "ACCESS_CONTEXT_INVALID"
    ) {
      this.sessions.invalidateContextIfCurrent(lease);
    }
  }
}

function isValidPage(
  value: BuyerCatalogFavoritePageResponse,
  expectedPage: number,
  expectedSize: number,
): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(value.items) &&
    Number.isSafeInteger(value.page) &&
    value.page === expectedPage &&
    Number.isSafeInteger(value.size) &&
    value.size === expectedSize &&
    Number.isSafeInteger(value.totalItems) &&
    value.totalItems >= 0 &&
    Number.isSafeInteger(value.totalPages) &&
    value.totalPages === Math.ceil(value.totalItems / expectedSize) &&
    value.items.length <= expectedSize &&
    value.items.every(isValidFavorite)
  );
}

function isValidFavorite(value: BuyerCatalogFavoriteResponse): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    isUuid(value.sellableSkuId) &&
    typeof value.favoritedAt === "string" &&
    Number.isFinite(Date.parse(value.favoritedAt)) &&
    (value.currentOffer === null ||
      (typeof value.currentOffer === "object" &&
        value.currentOffer.sellableSkuId === value.sellableSkuId))
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function sameLease(left: PortalSessionLease, right: PortalSessionLease): boolean {
  return (
    left.epoch === right.epoch &&
    left.scope.userId === right.scope.userId &&
    left.scope.tenantId === right.scope.tenantId &&
    left.scope.workspaceId === right.scope.workspaceId &&
    left.scope.membershipId === right.scope.membershipId &&
    left.scope.surface === right.scope.surface
  );
}

function addToSet(values: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(values);
  next.add(value);
  return next;
}

function without(values: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(values);
  next.delete(value);
  return next;
}

function upsertFavorite(
  favorites: readonly BuyerCatalogFavoriteResponse[],
  favorite: BuyerCatalogFavoriteResponse,
): readonly BuyerCatalogFavoriteResponse[] {
  return [
    favorite,
    ...favorites.filter(
      (item) => item.sellableSkuId !== favorite.sellableSkuId,
    ),
  ];
}

function favoritesLoadError(error: unknown): string {
  if (error instanceof NexaApiError && error.kind === "network") {
    return "Saved products could not be reached. Check your connection and try again.";
  }
  return "Saved products could not be loaded for this Buyer context. Try again.";
}

function favoritesActionError(error: unknown): string {
  if (error instanceof NexaApiError && error.kind === "network") {
    return "Saved products could not be updated because the API could not be reached.";
  }
  if (
    error instanceof NexaApiError &&
    error.kind === "not-found"
  ) {
    return "This product no longer has an active Buyer catalog offer.";
  }
  return "Saved products could not be updated. Refresh and try again.";
}
