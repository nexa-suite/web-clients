import { Injectable, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import {
  NexaApiError,
  NexaCommandRetryStore,
  NexaFulfillmentDeliveryApi,
  NexaFulfillmentReadinessApi,
} from "@nexa/api";
import type {
  FulfillmentCandidatePageResponse,
  FulfillmentCandidateResponse,
  FulfillmentWorkPageResponse,
  DispatchReadinessPageResponse,
  SalesOrderResponse,
} from "@nexa/api";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { fulfillmentApiErrorMessage } from "./fulfillment-api-error-message";
import { fulfillmentCommandRetryIdentity } from "./fulfillment-command-retry";

type LoadState<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: T }
  | {
      readonly status: "error";
      readonly message: string;
      readonly retryable: boolean;
    };

type OrderSelectionState =
  | { readonly status: "idle" }
  | {
      readonly status: "ready";
      readonly id: string;
      readonly candidate: FulfillmentCandidateResponse;
      readonly currentOrder: SalesOrderResponse | null;
      readonly ifMatch: string | null;
      readonly detailStatus:
        | "not-requested"
        | "loading"
        | "ready"
        | "unavailable"
        | "error";
    }
  | {
      readonly status: "error";
      readonly id: string;
      readonly message: string;
      readonly retryable: boolean;
    };

type StartActionState =
  | { readonly status: "idle" }
  | { readonly status: "preparing" }
  | { readonly status: "submitting" }
  | { readonly status: "success"; readonly message: string }
  | {
      readonly status: "error";
      readonly message: string;
      readonly retryable: boolean;
    };

export interface FulfillmentWorkbenchState {
  readonly lease: PlatformSessionLease | null;
  readonly candidates: LoadState<FulfillmentCandidatePageResponse>;
  readonly warehouseWork: LoadState<FulfillmentWorkPageResponse>;
  readonly dispatchReadiness: LoadState<DispatchReadinessPageResponse>;
  readonly order: OrderSelectionState;
  readonly start: StartActionState;
}

const NO_CONTEXT_MESSAGE =
  "A complete current Platform context is required to load fulfillment work.";
const SESSION_CHANGED_MESSAGE =
  "The active Platform context changed before this workbench could be updated.";

function idleState(lease: PlatformSessionLease | null): FulfillmentWorkbenchState {
  const noLease: LoadState<never> = {
    status: "error",
    message: NO_CONTEXT_MESSAGE,
    retryable: false,
  };
  return {
    lease,
    candidates: lease ? { status: "loading" } : noLease,
    warehouseWork: lease ? { status: "loading" } : noLease,
    dispatchReadiness: lease ? { status: "loading" } : noLease,
    order: { status: "idle" },
    start: { status: "idle" },
  };
}

/** Owns the Platform fulfillment board, selected Sales Order, and start command. */
@Injectable()
export class PlatformFulfillmentWorkbenchStore {
  private readonly reads = inject(NexaFulfillmentReadinessApi);
  private readonly commands = inject(NexaFulfillmentDeliveryApi);
  private readonly retries = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private boardRequestVersion = 0;
  private orderRequestVersion = 0;
  private startRequestVersion = 0;
  private readonly snapshot = signal<FulfillmentWorkbenchState>(idleState(null));

  readonly state = computed<FulfillmentWorkbenchState>(() => {
    const current = this.snapshot();
    if (!current.lease || this.sessions.isSessionLeaseCurrent(current.lease)) {
      return current;
    }
    const error: LoadState<never> = {
      status: "error",
      message: SESSION_CHANGED_MESSAGE,
      retryable: this.sessions.captureSessionLease() !== null,
    };
    return {
      ...current,
      lease: null,
      candidates: error,
      warehouseWork: error,
      dispatchReadiness: error,
      order: { status: "idle" },
      start: { status: "idle" },
    };
  });

  readonly hasFulfillmentManage = computed(() =>
    this.hasPermission("fulfillment.manage"),
  );

  readonly hasSalesOrderRead = computed(() => {
    const session = this.sessions.state();
    const permissions =
      session.status === "authenticated"
        ? session.session.membership?.permissions
        : undefined;
    return (
      permissions?.some((permission) =>
        [
          "sales.dashboard.read",
          "sales.purchase_request.read",
          "sales.order.read",
          "client.read",
        ].includes(permission),
      ) ?? false
    );
  });

  readonly canStartFulfillment = computed(() => {
    const page = this.state();
    const order = page.order;
    // The candidate query filters to confirmed orders. A loaded Sales Order
    // detail can invalidate that projection before the command is sent.
    return (
      page.lease !== null &&
      this.hasFulfillmentManage() &&
      order.status === "ready" &&
      order.ifMatch !== null &&
      (order.currentOrder === null || order.currentOrder.status === "CONFIRMED") &&
      page.start.status !== "preparing" &&
      page.start.status !== "submitting" &&
      page.start.status !== "success" &&
      (page.start.status !== "error" || page.start.retryable)
    );
  });

  refresh(): void {
    this.orderRequestVersion += 1;
    const lease = this.sessions.captureSessionLease();
    const version = ++this.boardRequestVersion;
    if (!lease) {
      this.snapshot.set(idleState(null));
      return;
    }
    this.snapshot.set(idleState(lease));
    this.loadBoards(lease, version);
  }

  openOrder(candidate: FulfillmentCandidateResponse, preserveStart = false): void {
    const page = this.snapshot();
    const lease = page.lease;
    const requestVersion = ++this.orderRequestVersion;
    if (!lease || !this.sessions.isSessionLeaseCurrent(lease)) {
      this.refresh();
      return;
    }
    const ifMatch = salesOrderIfMatchFromVersion(candidate.version);
    if (!ifMatch) {
      this.snapshot.update((current) => ({
        ...current,
        order: {
          status: "error",
          id: candidate.id,
          message:
            "The candidate did not include a safe current order version, so fulfillment cannot start.",
          retryable: false,
        },
      }));
      return;
    }

    const canLoadDetail = this.hasSalesOrderRead();
    this.snapshot.update((current) => ({
      ...current,
      order: {
        status: "ready",
        id: candidate.id,
        candidate,
        currentOrder: null,
        ifMatch,
        detailStatus: canLoadDetail ? "loading" : "not-requested",
      },
      start: preserveStart ? current.start : { status: "idle" },
    }));
    if (!canLoadDetail) return;

    this.reads
      .getSalesOrder(candidate.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          if (!this.isOrderRequestCurrent(requestVersion, lease)) return;
          if (
            order.body.id !== candidate.id ||
            versionEtag(order.etag, order.body.version) === null
          ) {
            this.updateSelectedOrder(candidate.id, (current) => ({
              ...current,
              ifMatch: null,
              detailStatus: "error",
            }));
            return;
          }
          this.updateSelectedOrder(candidate.id, (current) => ({
            ...current,
            currentOrder: order.body,
            ifMatch: order.etag,
            detailStatus: "ready",
          }));
        },
        error: (error: unknown) => {
          if (!this.isOrderRequestCurrent(requestVersion, lease)) return;
          this.handleSessionError(error, lease);
          this.updateSelectedOrder(candidate.id, (current) => ({
            ...current,
            detailStatus: isForbidden(error) ? "unavailable" : "error",
          }));
        },
      });
  }

  retryOrder(id: string): void {
    const candidates = this.snapshot().candidates;
    if (candidates.status !== "ready") return;
    const candidate = candidates.value.items.find((item) => item.id === id);
    if (candidate) this.openOrder(candidate);
  }

  async startFulfillment(): Promise<boolean> {
    if (!this.canStartFulfillment()) return false;
    const page = this.snapshot();
    const lease = page.lease;
    if (!lease || page.order.status !== "ready" || !page.order.ifMatch) return false;

    const { candidate, ifMatch } = page.order;
    const requestVersion = ++this.startRequestVersion;
    this.snapshot.update((current) => ({ ...current, start: { status: "preparing" } }));
    let identity;
    try {
      identity = await fulfillmentCommandRetryIdentity(
        this.retries,
        this.sessions,
        lease,
        candidate.id,
        "fulfillment-start",
        ifMatch,
        null,
      );
    } catch {
      identity = null;
    }
    if (!this.isStartRequestCurrent(requestVersion, lease)) return false;
    if (!identity) {
      this.snapshot.update((current) => ({
        ...current,
        start: {
          status: "error",
          message:
            "This browser could not preserve a scoped retry key. Fulfillment was not started.",
          retryable: false,
        },
      }));
      return false;
    }

    this.snapshot.update((current) => ({
      ...current,
      start: { status: "submitting" },
    }));
    this.commands
      .startFulfillment(candidate.id, ifMatch, identity.key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (!this.isStartRequestCurrent(requestVersion, lease)) return;
          if (result.body.salesOrderId !== candidate.id || !result.body.id) {
            this.snapshot.update((current) => ({
              ...current,
              start: {
                status: "error",
                message:
                  "The API response did not match the selected Sales Order.",
                retryable: false,
              },
            }));
            return;
          }
          try {
            this.retries.remove(identity.storageKey);
          } catch {
            // A completed command remains successful even if browser cleanup is unavailable.
          }
          this.snapshot.update((current) => ({
            ...current,
            order:
              current.order.status === "ready" && current.order.id === candidate.id
                ? {
                    ...current.order,
                    candidate: { ...current.order.candidate, status: "IN_FULFILLMENT" },
                    currentOrder: current.order.currentOrder
                      ? { ...current.order.currentOrder, status: "IN_FULFILLMENT" }
                      : null,
                    ifMatch: null,
                  }
                : current.order,
            start: {
              status: "success",
              message: `Fulfillment ${result.body.id} started for order ${candidate.number}.`,
            },
          }));
          this.refreshBoards(lease);
        },
        error: (error: unknown) => {
          if (!this.isStartRequestCurrent(requestVersion, lease)) return;
          this.handleSessionError(error, lease);
          this.snapshot.update((current) => ({
            ...current,
            start: {
              status: "error",
              message: fulfillmentApiErrorMessage(error),
              retryable: true,
            },
          }));
        },
      });
    return true;
  }

  refreshBoards(lease = this.snapshot().lease): void {
    if (!lease || !this.sessions.isSessionLeaseCurrent(lease)) return;
    const version = ++this.boardRequestVersion;
    this.snapshot.update((current) => ({
      ...current,
      candidates: { status: "loading" },
      warehouseWork: { status: "loading" },
      dispatchReadiness: { status: "loading" },
    }));
    this.loadBoards(lease, version);
  }

  private loadBoards(lease: PlatformSessionLease, version: number): void {
    this.reads
      .listOrderFulfillmentCandidates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          if (!this.isBoardRequestCurrent(version, lease)) return;
          this.snapshot.update((current) => ({
            ...current,
            candidates: { status: "ready", value },
          }));
        },
        error: (error: unknown) => {
          if (!this.isBoardRequestCurrent(version, lease)) return;
          this.handleSessionError(error, lease);
          this.snapshot.update((current) => ({
            ...current,
            candidates: this.loadError(error),
          }));
        },
      });
    this.reads
      .listFulfillmentWork()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          if (!this.isBoardRequestCurrent(version, lease)) return;
          this.snapshot.update((current) => ({
            ...current,
            warehouseWork: { status: "ready", value },
          }));
        },
        error: (error: unknown) => {
          if (!this.isBoardRequestCurrent(version, lease)) return;
          this.handleSessionError(error, lease);
          this.snapshot.update((current) => ({
            ...current,
            warehouseWork: this.loadError(error),
          }));
        },
      });
    this.reads
      .listDispatchReadiness()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          if (!this.isBoardRequestCurrent(version, lease)) return;
          this.snapshot.update((current) => ({
            ...current,
            dispatchReadiness: { status: "ready", value },
          }));
        },
        error: (error: unknown) => {
          if (!this.isBoardRequestCurrent(version, lease)) return;
          this.handleSessionError(error, lease);
          this.snapshot.update((current) => ({
            ...current,
            dispatchReadiness: this.loadError(error),
          }));
        },
      });
  }

  private updateSelectedOrder(
    id: string,
    update: (current: Extract<OrderSelectionState, { status: "ready" }>) =>
      Extract<OrderSelectionState, { status: "ready" }>,
  ): void {
    this.snapshot.update((current) => {
      if (current.order.status !== "ready" || current.order.id !== id) return current;
      return { ...current, order: update(current.order) };
    });
  }

  private loadError<T>(error: unknown): LoadState<T> {
    return {
      status: "error",
      message: fulfillmentApiErrorMessage(error),
      retryable: !isForbidden(error),
    };
  }

  private hasPermission(permission: string): boolean {
    const session = this.sessions.state();
    return (
      session.status === "authenticated" &&
      session.session.membership?.permissions?.includes(permission) === true
    );
  }

  private isBoardRequestCurrent(version: number, lease: PlatformSessionLease): boolean {
    return (
      !this.destroyRef.destroyed &&
      version === this.boardRequestVersion &&
      this.snapshot().lease?.epoch === lease.epoch &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private isOrderRequestCurrent(version: number, lease: PlatformSessionLease): boolean {
    return (
      !this.destroyRef.destroyed &&
      version === this.orderRequestVersion &&
      this.snapshot().lease?.epoch === lease.epoch &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private isStartRequestCurrent(version: number, lease: PlatformSessionLease): boolean {
    return (
      !this.destroyRef.destroyed &&
      version === this.startRequestVersion &&
      this.snapshot().lease?.epoch === lease.epoch &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private handleSessionError(error: unknown, lease: PlatformSessionLease): void {
    if (!(error instanceof NexaApiError)) return;
    if (error.kind === "unauthenticated") {
      if (this.sessions.expireSessionIfCurrent(lease)) {
        void this.router.navigate(["/sign-in"], {
          queryParams: { returnUrl: this.router.url },
        });
      }
      return;
    }
    if (
      error.kind === "forbidden" &&
      error.problem?.code === "ACCESS_CONTEXT_INVALID" &&
      this.sessions.invalidateContextIfCurrent(lease)
    ) {
      void this.router.navigate(["/sign-in"], {
        queryParams: { returnUrl: this.router.url },
      });
    }
  }

}

function isForbidden(error: unknown): boolean {
  return error instanceof NexaApiError && error.kind === "forbidden";
}

function salesOrderIfMatchFromVersion(version: number): string | null {
  if (!Number.isSafeInteger(version) || version < 0) return null;
  return `"${version}"`;
}

function versionEtag(etag: string | null, version: number): string | null {
  if (!etag || !Number.isSafeInteger(version) || version < 0) return null;
  return etag === `"${version}"` ? etag : null;
}
