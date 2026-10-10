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
  ConfirmPickingRequest,
  FulfillmentLineResponse,
  FulfillmentResourceResponse,
  FulfillmentResponse,
  PhysicalAllocationLineResponse,
  PhysicalAllocationResponse,
  OutgoingGoodsCheckResponse,
  RecordOutgoingGoodsCheckRequest,
  ResolveShortageRequest,
} from "@nexa/api";
import { forkJoin, firstValueFrom, of, type Observable } from "rxjs";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { fulfillmentApiErrorMessage } from "./fulfillment-api-error-message";
import { fulfillmentCommandRetryIdentity } from "./fulfillment-command-retry";

export type FulfillmentActionName =
  | "picking-start"
  | "picking-confirmation"
  | "shortage-resolution"
  | "packing"
  | "staging"
  | "ready-for-dispatch"
  | "outgoing-goods-check";

export interface PickingObservationDraft {
  readonly quantity: string;
  readonly lotId: string;
  readonly warehouseId: string;
}

export interface OutgoingObservationDraft {
  readonly quantity: string;
  readonly lotId: string;
}

export interface PickingRow {
  readonly key: string;
  readonly fulfillmentLine: FulfillmentLineResponse;
  readonly allocationLine: PhysicalAllocationLineResponse | null;
}

interface WarehouseFormDraft {
  readonly fulfillmentId: string | null;
  readonly observations: Readonly<Record<string, PickingObservationDraft>>;
  readonly outgoingObservations: Readonly<Record<string, OutgoingObservationDraft>>;
  readonly shortageReason: string;
}

function emptyWarehouseDraft(fulfillmentId: string | null = null): WarehouseFormDraft {
  return {
    fulfillmentId,
    observations: {},
    outgoingObservations: {},
    shortageReason: "",
  };
}

export type FulfillmentCommandState =
  | { readonly status: "idle" }
  | {
      readonly status: "preparing";
      readonly action: FulfillmentActionName;
    }
  | {
      readonly status: "submitting";
      readonly action: FulfillmentActionName;
    }
  | {
      readonly status: "error";
      readonly action: FulfillmentActionName;
      readonly payload: unknown;
      readonly etag: string;
      readonly key: string | null;
      readonly storageKey: string | null;
      readonly message: string;
    }
  | {
      readonly status: "success";
      readonly action: FulfillmentActionName;
      readonly message: string;
    };

export type WarehouseLifecycleState =
  | { readonly status: "idle" }
  | {
      readonly status: "loading";
      readonly id: string;
      readonly lease: PlatformSessionLease;
    }
  | {
      readonly status: "ready";
      readonly id: string;
      readonly lease: PlatformSessionLease;
      readonly fulfillment: FulfillmentResponse;
      readonly etag: string | null;
      readonly allocation: PhysicalAllocationResponse;
      readonly outgoingCheck: OutgoingGoodsCheckResponse | null;
      readonly command: FulfillmentCommandState;
    }
  | {
      readonly status: "error";
      readonly id: string;
      readonly lease: PlatformSessionLease;
      readonly message: string;
      readonly retryable: boolean;
    };

const SESSION_CHANGED_MESSAGE =
  "The active Platform context changed before warehouse work could be updated.";

/** Owns warehouse fulfillment snapshots and their versioned lifecycle commands. */
@Injectable()
export class PlatformWarehouseLifecycleStore {
  private readonly reads = inject(NexaFulfillmentReadinessApi);
  private readonly commands = inject(NexaFulfillmentDeliveryApi);
  private readonly retries = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private requestVersion = 0;
  private readonly form = signal<WarehouseFormDraft>(emptyWarehouseDraft());
  private readonly snapshot = signal<WarehouseLifecycleState>({
    status: "idle",
  });

  readonly state = computed<WarehouseLifecycleState>(() => {
    const current = this.snapshot();
    if (current.status === "idle") {
      return current;
    }
    if (this.sessions.isSessionLeaseCurrent(current.lease)) return current;
    return {
      status: "error",
      id: current.id,
      lease: current.lease,
      message: SESSION_CHANGED_MESSAGE,
      retryable: this.sessions.captureSessionLease() !== null,
    };
  });

  readonly canManage = computed(() => {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      current.session.membership?.permissions?.includes(
        "fulfillment.manage",
      ) === true
    );
  });

  clear(): void {
    this.requestVersion += 1;
    this.form.set(emptyWarehouseDraft());
    this.snapshot.set({ status: "idle" });
  }

  inspect(
    fulfillmentId: string,
    lease: PlatformSessionLease,
    expectedAllocationId?: string,
  ): void {
    const requestVersion = ++this.requestVersion;
    this.form.set(emptyWarehouseDraft(fulfillmentId));
    if (!this.sessions.isSessionLeaseCurrent(lease)) {
      this.clear();
      return;
    }
    this.snapshot.set({ status: "loading", id: fulfillmentId, lease });
    forkJoin({
      fulfillment: this.reads.getFulfillment(fulfillmentId),
      allocation: this.reads.getPhysicalAllocation(fulfillmentId),
      outgoingCheck: this.canManage()
        ? this.commands.getCurrentOutgoingGoodsCheck(fulfillmentId)
        : of(null),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ fulfillment, allocation, outgoingCheck }) => {
          if (!this.isLoadCurrent(fulfillmentId, requestVersion, lease)) return;
          if (
            fulfillment.body.id !== fulfillmentId ||
            fulfillment.body.physicalAllocationId !== allocation.body.allocationId ||
            (outgoingCheck !== null &&
              outgoingCheck.body.fulfillmentId !== fulfillmentId) ||
            (expectedAllocationId !== undefined &&
              allocation.body.allocationId !== expectedAllocationId)
          ) {
            this.snapshot.set({
              status: "error",
              id: fulfillmentId,
              lease,
              message:
                "The current fulfillment and physical allocation do not match.",
              retryable: false,
            });
            return;
          }
          this.snapshot.set({
            status: "ready",
            id: fulfillmentId,
            lease,
            fulfillment: fulfillment.body,
            etag: versionEtag(fulfillment.etag, fulfillment.body.version),
            allocation: allocation.body,
            outgoingCheck: outgoingCheck?.body ?? null,
            command: { status: "idle" },
          });
        },
        error: (error: unknown) => {
          if (!this.isLoadCurrent(fulfillmentId, requestVersion, lease)) return;
          this.handleSessionError(error, lease);
          this.snapshot.set({
            status: "error",
            id: fulfillmentId,
            lease,
            message: fulfillmentApiErrorMessage(error),
            retryable: !(error instanceof NexaApiError && error.kind === "forbidden"),
          });
        },
      });
  }

  reload(): void {
    const current = this.snapshot();
    if (current.status === "idle") return;
    this.inspect(current.id, current.lease);
  }

  pickingRows(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): readonly PickingRow[] {
    const rows: PickingRow[] = [];
    for (const fulfillmentLine of inspection.fulfillment.lines) {
      const allocationLines = inspection.allocation.lines.filter(
        (line) =>
          line.skuId === fulfillmentLine.skuId &&
          line.catalogItemId === fulfillmentLine.catalogItemId &&
          line.unit === fulfillmentLine.unit,
      );
      if (allocationLines.length === 0) {
        rows.push({
          key: `missing:${fulfillmentLine.id}`,
          fulfillmentLine,
          allocationLine: null,
        });
        continue;
      }
      for (const allocationLine of allocationLines) {
        rows.push({
          key: allocationLine.physicalAllocationLineId,
          fulfillmentLine,
          allocationLine,
        });
      }
    }
    return rows;
  }

  pickingObservation(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
    key: string,
  ): PickingObservationDraft {
    return this.formFor(inspection.id).observations[key] ?? emptyPickingObservation();
  }

  setPickingObservation(
    key: string,
    field: keyof PickingObservationDraft,
    value: string,
  ): void {
    const inspection = this.currentInspection();
    if (!inspection) return;
    const draft = this.formFor(inspection.id);
    const observation = draft.observations[key] ?? emptyPickingObservation();
    this.form.set({
      ...draft,
      fulfillmentId: inspection.id,
      observations: {
        ...draft.observations,
        [key]: { ...observation, [field]: value },
      },
    });
  }

  outgoingObservation(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
    lineId: string,
  ): OutgoingObservationDraft {
    return this.formFor(inspection.id).outgoingObservations[lineId] ??
      emptyOutgoingObservation();
  }

  setOutgoingObservation(
    lineId: string,
    field: keyof OutgoingObservationDraft,
    value: string,
  ): void {
    const inspection = this.currentInspection();
    if (!inspection) return;
    const draft = this.formFor(inspection.id);
    const observation = draft.outgoingObservations[lineId] ??
      emptyOutgoingObservation();
    this.form.set({
      ...draft,
      fulfillmentId: inspection.id,
      outgoingObservations: {
        ...draft.outgoingObservations,
        [lineId]: { ...observation, [field]: value },
      },
    });
  }

  shortageReason(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): string {
    return this.formFor(inspection.id).shortageReason;
  }

  setShortageReason(value: string): void {
    const inspection = this.currentInspection();
    if (!inspection) return;
    this.form.set({
      ...this.formFor(inspection.id),
      fulfillmentId: inspection.id,
      shortageReason: value,
    });
  }

  isCommandLocked(command: FulfillmentCommandState): boolean {
    return (
      command.status === "preparing" ||
      command.status === "submitting" ||
      command.status === "error"
    );
  }

  canStartPicking(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): boolean {
    return this.canExecute("picking-start", inspection) &&
      !this.isCommandLocked(inspection.command);
  }

  canConfirmPicking(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): boolean {
    return this.canExecute("picking-confirmation", inspection) &&
      !this.isCommandLocked(inspection.command);
  }

  canResolveShortage(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): boolean {
    return this.canExecute("shortage-resolution", inspection) &&
      !this.isCommandLocked(inspection.command);
  }

  canPack(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): boolean {
    return this.canTransition(inspection, "PICKED");
  }

  canStage(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): boolean {
    return this.canTransition(inspection, "PACKED");
  }

  canMarkReadyForDispatch(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): boolean {
    return this.canTransition(inspection, "STAGED");
  }

  canRecordOutgoingCheck(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): boolean {
    return this.canExecute("outgoing-goods-check", inspection) &&
      !this.isCommandLocked(inspection.command);
  }

  startPicking(): Promise<boolean> {
    return this.execute("picking-start");
  }

  confirmPicking(): Promise<boolean> {
    return this.execute("picking-confirmation");
  }

  resolveShortage(): Promise<boolean> {
    return this.execute("shortage-resolution");
  }

  packFulfillment(): Promise<boolean> {
    return this.execute("packing");
  }

  stageFulfillment(): Promise<boolean> {
    return this.execute("staging");
  }

  markReadyForDispatch(): Promise<boolean> {
    return this.execute("ready-for-dispatch");
  }

  recordOutgoingGoodsCheck(): Promise<boolean> {
    return this.execute("outgoing-goods-check");
  }

  async execute(action: FulfillmentActionName): Promise<boolean> {
    const current = this.state();
    if (
      current.status !== "ready" ||
      !this.canManage() ||
      !this.sessions.isSessionLeaseCurrent(current.lease) ||
      this.isCommandLocked(current.command) ||
      !this.canExecute(action, current) ||
      !versionEtag(current.etag, current.fulfillment.version)
    ) {
      return false;
    }
    const body = immutablePayload(this.commandPayload(action, current));
    const requestVersion = this.requestVersion;
    this.setCommand(current.id, {
      status: "preparing",
      action,
    });

    let identity;
    try {
      identity = await fulfillmentCommandRetryIdentity(
        this.retries,
        this.sessions,
        current.lease,
        current.id,
        action,
        current.etag ?? "",
        body,
      );
    } catch {
      identity = null;
    }
    if (!this.isCommandCurrent(current.id, requestVersion, current.lease)) {
      return false;
    }
    if (!versionEtag(current.etag, current.fulfillment.version) || !identity) {
      this.setCommandError(
        current.id,
        action,
        body,
        current.etag ?? "",
        null,
        null,
        !versionEtag(current.etag, current.fulfillment.version)
          ? "The API did not return a current ETag. Reload warehouse work before sending a command."
          : "This browser could not preserve a scoped retry key. The command was not sent.",
      );
      return false;
    }
    return this.send(
      current.id,
      action,
      body,
      current.etag!,
      identity.key,
      identity.storageKey,
      current.lease,
      requestVersion,
    );
  }

  async retry(): Promise<boolean> {
    const current = this.state();
    if (
      current.status !== "ready" ||
      current.command.status !== "error" ||
      !current.command.key ||
      !current.command.storageKey ||
      !this.canManage() ||
      !this.sessions.isSessionLeaseCurrent(current.lease)
    ) {
      return false;
    }
    return this.send(
      current.id,
      current.command.action,
      current.command.payload,
      current.command.etag,
      current.command.key,
      current.command.storageKey,
      current.lease,
      this.requestVersion,
    );
  }

  private async send(
    fulfillmentId: string,
    action: FulfillmentActionName,
    payload: unknown,
    etag: string,
    key: string,
    storageKey: string,
    lease: PlatformSessionLease,
    requestVersion: number,
  ): Promise<boolean> {
    if (
      !this.isCommandCurrent(fulfillmentId, requestVersion, lease) ||
      !this.canManage()
    ) {
      return false;
    }
    this.setCommand(fulfillmentId, { status: "submitting", action });
    const request = this.commandRequest(fulfillmentId, action, etag, key, payload);
    try {
      const result = await firstValueFrom(
        request.pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (!this.isCommandCurrent(fulfillmentId, requestVersion, lease)) return false;
      const responseFulfillmentId = action === "outgoing-goods-check"
        ? (result.body as OutgoingGoodsCheckResponse).fulfillmentId
        : (result.body as FulfillmentResponse).id;
      if (responseFulfillmentId !== fulfillmentId) {
        this.setCommandError(
          fulfillmentId,
          action,
          payload,
          etag,
          key,
          storageKey,
          "The API response did not match this fulfillment. Reload its current state before continuing.",
        );
        return false;
      }
      this.retries.remove(storageKey);
      this.applyCommandResult(fulfillmentId, action, result.body, result.etag);
      return true;
    } catch (error: unknown) {
      if (!this.isCommandCurrent(fulfillmentId, requestVersion, lease)) return false;
      this.handleSessionError(error, lease);
      this.setCommandError(
        fulfillmentId,
        action,
        payload,
        etag,
        key,
        storageKey,
        fulfillmentApiErrorMessage(error),
      );
      return false;
    }
  }

  private commandRequest(
    fulfillmentId: string,
    action: FulfillmentActionName,
    etag: string,
    key: string,
    payload: unknown,
  ): Observable<WarehouseCommandResponse> {
    switch (action) {
      case "picking-start":
        return this.commands.startPicking(fulfillmentId, etag, key);
      case "picking-confirmation":
        return this.commands.confirmPicking(
          fulfillmentId,
          etag,
          key,
          payload as ConfirmPickingRequest,
        );
      case "shortage-resolution":
        return this.commands.resolveShortage(
          fulfillmentId,
          etag,
          key,
          payload as ResolveShortageRequest,
        );
      case "packing":
        return this.commands.pack(fulfillmentId, etag, key);
      case "staging":
        return this.commands.stage(fulfillmentId, etag, key);
      case "ready-for-dispatch":
        return this.commands.readyForDispatch(fulfillmentId, etag, key);
      case "outgoing-goods-check":
        return this.commands.recordOutgoingGoodsCheck(
          fulfillmentId,
          etag,
          key,
          payload as RecordOutgoingGoodsCheckRequest,
        );
    }
  }

  private applyCommandResult(
    fulfillmentId: string,
    action: FulfillmentActionName,
    body: WarehouseCommandResponse["body"],
    etag: string | null,
  ): void {
    this.snapshot.update((state) => {
      if (state.status !== "ready" || state.id !== fulfillmentId) return state;
      const command: FulfillmentCommandState = {
        status: "success",
        action,
        message: fulfillmentActionSuccessMessage(action),
      };
      if (action === "outgoing-goods-check") {
        const check = body as OutgoingGoodsCheckResponse;
        return {
          ...state,
          outgoingCheck: check,
          etag: versionEtag(etag, check.fulfillmentVersion),
          command,
        };
      }
      const fulfillment = body as FulfillmentResponse;
      return {
        ...state,
        fulfillment,
        etag: versionEtag(etag, fulfillment.version),
        command,
      };
    });
  }

  private setCommand(
    fulfillmentId: string,
    command: FulfillmentCommandState,
  ): void {
    this.snapshot.update((current) =>
      current.status === "ready" && current.id === fulfillmentId
        ? { ...current, command }
        : current,
    );
  }

  private setCommandError(
    fulfillmentId: string,
    action: FulfillmentActionName,
    payload: unknown,
    etag: string,
    key: string | null,
    storageKey: string | null,
    message: string,
  ): void {
    this.setCommand(fulfillmentId, {
      status: "error",
      action,
      payload,
      etag,
      key,
      storageKey,
      message,
    });
  }

  private canExecute(
    action: FulfillmentActionName,
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): boolean {
    if (
      !this.canManage() ||
      versionEtag(inspection.etag, inspection.fulfillment.version) === null
    ) {
      return false;
    }
    switch (action) {
      case "picking-start":
        return inspection.fulfillment.status === "ALLOCATED";
      case "picking-confirmation":
        return (
          inspection.fulfillment.status === "PICKING" &&
          this.confirmPickingRequest(inspection) !== null
        );
      case "shortage-resolution":
        return (
          inspection.fulfillment.status === "SHORTAGE" &&
          this.formFor(inspection.id).shortageReason.trim().length > 0 &&
          this.shortageResolutionRequest(inspection) !== null
        );
      case "packing":
        return this.canTransitionState(inspection, "PICKED");
      case "staging":
        return this.canTransitionState(inspection, "PACKED");
      case "ready-for-dispatch":
        return this.canTransitionState(inspection, "STAGED");
      case "outgoing-goods-check":
        return inspection.fulfillment.status === "READY_FOR_DISPATCH" &&
          this.outgoingGoodsRequest(inspection) !== null;
    }
  }

  private commandPayload(
    action: FulfillmentActionName,
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): unknown {
    switch (action) {
      case "picking-confirmation":
        return this.confirmPickingRequest(inspection);
      case "shortage-resolution":
        return this.shortageResolutionRequest(inspection);
      case "outgoing-goods-check":
        return this.outgoingGoodsRequest(inspection);
      default:
        return null;
    }
  }

  private currentInspection():
    | Extract<WarehouseLifecycleState, { status: "ready" }>
    | null {
    const current = this.state();
    return current.status === "ready" ? current : null;
  }

  private formFor(fulfillmentId: string): WarehouseFormDraft {
    const current = this.form();
    return current.fulfillmentId === fulfillmentId
      ? current
      : emptyWarehouseDraft(fulfillmentId);
  }

  private confirmPickingRequest(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): ConfirmPickingRequest | null {
    const rows = this.pickingRows(inspection);
    if (rows.length === 0 || !Number.isSafeInteger(inspection.allocation.version)) {
      return null;
    }
    const lines: ConfirmPickingRequest["lines"][number][] = [];
    const totals = new Map<string, number>();
    const coveredFulfillmentLines = new Set<string>();
    for (const row of rows) {
      const observation = this.pickingObservation(inspection, row.key);
      if (!observation.quantity.trim()) return null;
      const quantity = Number(observation.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) return null;
      totals.set(
        row.fulfillmentLine.id,
        (totals.get(row.fulfillmentLine.id) ?? 0) + quantity,
      );
      coveredFulfillmentLines.add(row.fulfillmentLine.id);
      if (quantity === 0) continue;
      if (
        !row.allocationLine ||
        quantity > row.allocationLine.remainingQuantity ||
        !observation.lotId.trim() ||
        !observation.warehouseId.trim()
      ) {
        return null;
      }
      lines.push({
        fulfillmentLineId: row.fulfillmentLine.id,
        skuId: row.fulfillmentLine.skuId,
        quantity,
        unit: row.fulfillmentLine.unit,
        physicalAllocationLineId: row.allocationLine.physicalAllocationLineId,
        lotId: observation.lotId.trim(),
        warehouseId: observation.warehouseId.trim(),
        fefoOverride: false,
        fefoOverrideReason: null,
      });
    }
    for (const line of inspection.fulfillment.lines) {
      const total = totals.get(line.id);
      if (total === undefined || total > line.allocatedQuantity) return null;
      if (total === 0) {
        lines.push({
          fulfillmentLineId: line.id,
          skuId: line.skuId,
          quantity: 0,
          unit: line.unit,
          physicalAllocationLineId: null,
          lotId: null,
          warehouseId: null,
          fefoOverride: false,
          fefoOverrideReason: null,
        });
      }
    }
    if (coveredFulfillmentLines.size !== inspection.fulfillment.lines.length) {
      return null;
    }
    return {
      pickerIdentityId: null,
      startedAt: null,
      completedAt: null,
      allocationVersion: inspection.allocation.version,
      notes: null,
      lines,
    };
  }

  private shortageResolutionRequest(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): ResolveShortageRequest | null {
    const lines = inspection.fulfillment.lines
      .filter((line) => line.allocatedQuantity > line.pickedQuantity)
      .map((line) => ({
        fulfillmentLineId: line.id,
        skuId: line.skuId,
        quantity: line.allocatedQuantity - line.pickedQuantity,
        unit: line.unit,
      }));
    const reason = this.formFor(inspection.id).shortageReason.trim();
    return lines.length > 0 && reason ? { reason, lines } : null;
  }

  private outgoingGoodsRequest(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
  ): RecordOutgoingGoodsCheckRequest | null {
    if (inspection.allocation.lines.length === 0) return null;
    const observations: RecordOutgoingGoodsCheckRequest["observations"][number][] = [];
    for (const line of inspection.allocation.lines) {
      const draft = this.formFor(inspection.id).outgoingObservations[
        line.physicalAllocationLineId
      ] ?? emptyOutgoingObservation();
      if (!draft.quantity.trim()) return null;
      const quantity = Number(draft.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) return null;
      const observedLotId = draft.lotId.trim() || null;
      if ((quantity > 0 && observedLotId === null) ||
          (quantity === 0 && observedLotId !== null)) {
        return null;
      }
      observations.push({
        physicalAllocationLineId: line.physicalAllocationLineId,
        observedLotId,
        observedQuantity: quantity,
      });
    }
    return {
      physicalAllocationId: inspection.allocation.allocationId,
      physicalAllocationVersion: inspection.allocation.version,
      observations,
    };
  }

  private canTransition(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
    status: FulfillmentResponse["status"],
  ): boolean {
    return (
      this.canTransitionState(inspection, status) &&
      !this.isCommandLocked(inspection.command)
    );
  }

  private canTransitionState(
    inspection: Extract<WarehouseLifecycleState, { status: "ready" }>,
    status: FulfillmentResponse["status"],
  ): boolean {
    return inspection.fulfillment.status === status;
  }

  private isLoadCurrent(
    id: string,
    version: number,
    lease: PlatformSessionLease,
  ): boolean {
    const current = this.snapshot();
    return (
      !this.destroyRef.destroyed &&
      version === this.requestVersion &&
      current.status === "loading" &&
      current.id === id &&
      current.lease.epoch === lease.epoch &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private isCommandCurrent(
    id: string,
    version: number,
    lease: PlatformSessionLease,
  ): boolean {
    const current = this.snapshot();
    return (
      !this.destroyRef.destroyed &&
      version === this.requestVersion &&
      current.status === "ready" &&
      current.id === id &&
      current.lease.epoch === lease.epoch &&
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
      error.problem?.code === "ACCESS_CONTEXT_INVALID" &&
      this.sessions.invalidateContextIfCurrent(lease)
    ) {
      void this.router.navigate(["/sign-in"], {
        queryParams: { returnUrl: this.router.url },
      });
    }
  }
}

function emptyPickingObservation(): PickingObservationDraft {
  return { quantity: "", lotId: "", warehouseId: "" };
}

function emptyOutgoingObservation(): OutgoingObservationDraft {
  return { quantity: "", lotId: "" };
}

type WarehouseCommandResponse =
  | FulfillmentResourceResponse
  | {
      readonly body: OutgoingGoodsCheckResponse;
      readonly etag: string | null;
    };

function versionEtag(etag: string | null, version: number): string | null {
  if (!etag || !Number.isSafeInteger(version) || version < 0) return null;
  return etag === `"${version}"` ? etag : null;
}

function immutablePayload(payload: unknown): unknown {
  return payload === null ? null : JSON.parse(JSON.stringify(payload));
}

function fulfillmentActionSuccessMessage(action: FulfillmentActionName): string {
  switch (action) {
    case "picking-start":
      return "Picking started from the current fulfillment snapshot.";
    case "picking-confirmation":
      return "The API recorded the actual picked quantities and lot evidence.";
    case "shortage-resolution":
      return "The API recorded the shortage resolution.";
    case "packing":
      return "The API recorded packing for this fulfillment.";
    case "staging":
      return "The API recorded staging for this fulfillment.";
    case "ready-for-dispatch":
      return "The API marked this fulfillment ready for dispatch.";
    case "outgoing-goods-check":
      return "The API compared observed goods with the current physical allocation.";
  }
}
