import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import {
  NexaCommandRetryStore,
  NexaApiError,
  NexaFulfillmentDeliveryApi,
  NexaFulfillmentReadinessApi,
} from "@nexa/api";
import type {
  DispatchReadinessPageResponse,
  FulfillmentCandidatePageResponse,
  FulfillmentCandidateResponse,
  FulfillmentWorkItemResponse,
  FulfillmentWorkPageResponse,
  PhysicalAllocationResponse,
  SalesOrderResponse,
} from "@nexa/api";
import { forkJoin } from "rxjs";
import { NexaButton } from "nexa-ui";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "../../tenant-access-governance/application/public-api";
import { platformFulfillmentApiErrorMessage } from "./platform-fulfillment-api-error-message";

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

type FulfillmentInspectionState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly id: string }
  | {
      readonly status: "ready";
      readonly id: string;
      readonly fulfillment: string;
      readonly allocation: PhysicalAllocationResponse;
    }
  | {
      readonly status: "error";
      readonly id: string;
      readonly message: string;
    };

type StartActionState =
  | { readonly status: "idle" }
  | { readonly status: "submitting" }
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

interface FulfillmentWorkspaceState {
  readonly lease: PlatformSessionLease | null;
  readonly candidates: LoadState<FulfillmentCandidatePageResponse>;
  readonly warehouseWork: LoadState<FulfillmentWorkPageResponse>;
  readonly dispatchReadiness: LoadState<DispatchReadinessPageResponse>;
  readonly order: OrderSelectionState;
  readonly inspection: FulfillmentInspectionState;
  readonly start: StartActionState;
}

const NO_CONTEXT_MESSAGE =
  "A complete current Platform context is required to load fulfillment work.";
const SESSION_CHANGED_MESSAGE =
  "The active Platform context changed before this workbench could be updated.";

function idleState(
  lease: PlatformSessionLease | null,
): FulfillmentWorkspaceState {
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
    inspection: { status: "idle" },
    start: { status: "idle" },
  };
}

@Component({
  selector: "platform-fulfillment-delivery",
  standalone: true,
  imports: [NexaButton],
  templateUrl: "./platform-fulfillment-delivery.component.html",
  styleUrl: "./platform-fulfillment-delivery.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformFulfillmentDeliveryComponent implements OnInit {
  private readonly reads = inject(NexaFulfillmentReadinessApi);
  private readonly commands = inject(NexaFulfillmentDeliveryApi);
  private readonly commandRetry = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private boardRequestVersion = 0;
  private orderRequestVersion = 0;
  private inspectionRequestVersion = 0;
  private startRequestVersion = 0;

  private readonly snapshot = signal<FulfillmentWorkspaceState>(
    idleState(null),
  );

  protected readonly state = computed<FulfillmentWorkspaceState>(() => {
    const current = this.snapshot();
    if (!current.lease || this.sessions.isSessionLeaseCurrent(current.lease)) {
      return current;
    }
    const error: LoadState<never> = {
      status: "error",
      message: SESSION_CHANGED_MESSAGE,
      retryable: this.sessions.captureSessionLease() !== null,
    };
    const invalidated: FulfillmentWorkspaceState = {
      ...current,
      lease: null,
      candidates: error,
      warehouseWork: error,
      dispatchReadiness: error,
      order: { status: "idle" },
      inspection: { status: "idle" },
      start: { status: "idle" },
    };
    return invalidated;
  });

  protected readonly hasFulfillmentManage = computed(() => {
    const session = this.sessions.state();
    return (
      session.status === "authenticated" &&
      session.session.membership?.permissions?.includes(
        "fulfillment.manage",
      ) === true
    );
  });

  protected readonly hasSalesOrderRead = computed(() => {
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

  protected readonly canStartFulfillment = computed(() => {
    const page = this.state();
    const order = page.order;
    // The candidate query already filters to confirmed orders. Its status is a
    // fulfillment-readiness value, so only a loaded Sales Order detail can
    // invalidate the confirmed-state assumption.
    return (
      page.lease !== null &&
      this.hasFulfillmentManage() &&
      order.status === "ready" &&
      order.ifMatch !== null &&
      (order.currentOrder === null ||
        order.currentOrder.status === "CONFIRMED") &&
      page.start.status !== "submitting" &&
      page.start.status !== "success"
    );
  });

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    const lease = this.sessions.captureSessionLease();
    const version = ++this.boardRequestVersion;
    if (!lease) {
      this.snapshot.set(idleState(null));
      return;
    }
    this.snapshot.set(idleState(lease));
    this.loadBoards(lease, version);
  }

  protected openOrder(
    candidate: FulfillmentCandidateResponse,
    preserveStart = false,
  ): void {
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
          if (order.body.id !== candidate.id || !order.etag?.trim()) {
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

  private updateSelectedOrder(
    id: string,
    update: (
      current: Extract<OrderSelectionState, { status: "ready" }>,
    ) => Extract<OrderSelectionState, { status: "ready" }>,
  ): void {
    this.snapshot.update((current) => {
      if (current.order.status !== "ready" || current.order.id !== id)
        return current;
      return { ...current, order: update(current.order) };
    });
  }

  protected inspectWork(item: FulfillmentWorkItemResponse): void {
    const page = this.snapshot();
    const lease = page.lease;
    const requestVersion = ++this.inspectionRequestVersion;
    if (!lease || !this.sessions.isSessionLeaseCurrent(lease)) {
      this.refresh();
      return;
    }
    const currentInspection = page.inspection;
    if (
      currentInspection.status === "ready" &&
      currentInspection.id === item.fulfillmentId
    ) {
      this.snapshot.update((current) => ({
        ...current,
        inspection: { status: "idle" },
      }));
      return;
    }
    this.snapshot.update((current) => ({
      ...current,
      inspection: { status: "loading", id: item.fulfillmentId },
    }));
    forkJoin({
      fulfillment: this.reads.getFulfillment(item.fulfillmentId),
      allocation: this.reads.getPhysicalAllocation(item.fulfillmentId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ fulfillment, allocation }) => {
          if (!this.isInspectionRequestCurrent(requestVersion, lease)) return;
          if (
            fulfillment.body.id !== item.fulfillmentId ||
            allocation.body.allocationId !== item.physicalAllocationId
          ) {
            this.snapshot.update((current) => ({
              ...current,
              inspection: {
                status: "error",
                id: item.fulfillmentId,
                message:
                  "The fulfillment and allocation details do not match this work item.",
              },
            }));
            return;
          }
          this.snapshot.update((current) => ({
            ...current,
            inspection: {
              status: "ready",
              id: item.fulfillmentId,
              fulfillment: fulfillment.body.status,
              allocation: allocation.body,
            },
          }));
        },
        error: (error: unknown) => {
          if (!this.isInspectionRequestCurrent(requestVersion, lease)) return;
          this.handleSessionError(error, lease);
          this.snapshot.update((current) => ({
            ...current,
            inspection: {
              status: "error",
              id: item.fulfillmentId,
              message: platformFulfillmentApiErrorMessage(error),
            },
          }));
        },
      });
  }

  protected startFulfillment(): void {
    if (!this.canStartFulfillment()) return;
    const page = this.snapshot();
    const lease = page.lease;
    if (!lease || page.order.status !== "ready" || !page.order.ifMatch) return;

    const { candidate, ifMatch } = page.order;
    const key = this.getOrCreateIdempotencyKey(lease, candidate.id, ifMatch);
    if (!key) {
      this.snapshot.update((current) => ({
        ...current,
        start: {
          status: "error",
          message:
            "This browser could not preserve a retry key. Fulfillment was not started.",
        },
      }));
      return;
    }

    const requestVersion = ++this.startRequestVersion;
    this.snapshot.update((current) => ({
      ...current,
      start: { status: "submitting" },
    }));
    this.commands
      .startFulfillment(candidate.id, ifMatch, key)
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
              },
            }));
            return;
          }
          this.removeIdempotencyKey(lease, candidate.id, ifMatch);
          this.snapshot.update((current) => ({
            ...current,
            order:
              current.order.status === "ready" &&
              current.order.id === candidate.id
                ? {
                    ...current.order,
                    candidate: {
                      ...current.order.candidate,
                      status: "IN_FULFILLMENT",
                    },
                    currentOrder: current.order.currentOrder
                      ? {
                          ...current.order.currentOrder,
                          status: "IN_FULFILLMENT",
                        }
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
              message: platformFulfillmentApiErrorMessage(error),
            },
          }));
        },
      });
  }

  protected retryOrder(id: string): void {
    const candidates = this.snapshot().candidates;
    if (candidates.status !== "ready") return;
    const candidate = candidates.value.items.find((item) => item.id === id);
    if (candidate) this.openOrder(candidate);
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

  private refreshBoards(lease: PlatformSessionLease): void {
    if (!this.sessions.isSessionLeaseCurrent(lease)) return;
    const version = ++this.boardRequestVersion;
    this.snapshot.update((current) => ({
      ...current,
      candidates: { status: "loading" },
      warehouseWork: { status: "loading" },
      dispatchReadiness: { status: "loading" },
    }));
    this.loadBoards(lease, version);
  }

  private loadError<T>(error: unknown): LoadState<T> {
    return {
      status: "error",
      message: platformFulfillmentApiErrorMessage(error),
      retryable: !isForbidden(error),
    };
  }

  private isBoardRequestCurrent(
    version: number,
    lease: PlatformSessionLease,
  ): boolean {
    return (
      version === this.boardRequestVersion &&
      this.snapshot().lease?.epoch === lease.epoch &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private isOrderRequestCurrent(
    version: number,
    lease: PlatformSessionLease,
  ): boolean {
    return (
      version === this.orderRequestVersion &&
      this.snapshot().lease?.epoch === lease.epoch &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private isInspectionRequestCurrent(
    version: number,
    lease: PlatformSessionLease,
  ): boolean {
    return (
      version === this.inspectionRequestVersion &&
      this.snapshot().lease?.epoch === lease.epoch &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private isStartRequestCurrent(
    version: number,
    lease: PlatformSessionLease,
  ): boolean {
    return (
      version === this.startRequestVersion &&
      this.snapshot().lease?.epoch === lease.epoch &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private handleSessionError(
    error: unknown,
    lease: PlatformSessionLease,
  ): void {
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
      error.problem?.code === "ACCESS_CONTEXT_INVALID"
    ) {
      if (this.sessions.invalidateContextIfCurrent(lease)) {
        void this.router.navigate(["/sign-in"], {
          queryParams: { returnUrl: this.router.url },
        });
      }
    }
  }

  private getOrCreateIdempotencyKey(
    lease: PlatformSessionLease,
    orderId: string,
    etag: string,
  ): string | null {
    const storageKey = this.idempotencyStorageKey(lease, orderId, etag);
    const existing = this.commandRetry.read(storageKey);
    if (existing) return existing;
    const key = globalThis.crypto?.randomUUID?.();
    if (!key) return null;
    this.commandRetry.write(storageKey, key);
    return key;
  }

  private removeIdempotencyKey(
    lease: PlatformSessionLease,
    orderId: string,
    etag: string,
  ): void {
    this.commandRetry.remove(this.idempotencyStorageKey(lease, orderId, etag));
  }

  private idempotencyStorageKey(
    lease: PlatformSessionLease,
    orderId: string,
    etag: string,
  ): string {
    const { userId, tenantId, workspaceId, membershipId } = lease.scope;
    const scope = [userId, tenantId, workspaceId, membershipId, orderId, etag]
      .map(encodeURIComponent)
      .join(":");
    return `nexa.platform.fulfillment-start:${scope}`;
  }
}

function isForbidden(error: unknown): boolean {
  return error instanceof NexaApiError && error.kind === "forbidden";
}

function salesOrderIfMatchFromVersion(version: number): string | null {
  if (!Number.isSafeInteger(version) || version < 0) return null;
  // The current API emits Sales Order ETags as a quoted decimal version and the start route accepts that same tag.
  return `"${version}"`;
}
