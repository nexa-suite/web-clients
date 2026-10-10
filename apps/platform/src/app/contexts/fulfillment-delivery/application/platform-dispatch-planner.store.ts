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
  AssignDriverRequest,
  DispatchAssigneeResponse,
  DispatchOutgoingGoodsCheckSummaryResponse,
  DispatchRequest,
  DispatchReadinessResponse,
  DispatchWindowPlanRequest,
  DispatchWindowPlanResponse,
  DriverAssignmentResponse,
  FulfillmentResponse,
  PhysicalAllocationResponse,
} from "@nexa/api";
import { forkJoin, firstValueFrom, of, type Observable } from "rxjs";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { fulfillmentApiErrorMessage } from "./fulfillment-api-error-message";
import { fulfillmentCommandRetryIdentity } from "./fulfillment-command-retry";

export type DispatchActionName =
  | "driver-assignment"
  | "dispatch-window-plan"
  | "dispatch-handoff";

export interface DispatchFormDraft {
  readonly fulfillmentId: string | null;
  readonly selectedDriverMembershipId: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly windowReason: string;
}

function emptyDispatchDraft(fulfillmentId: string | null = null): DispatchFormDraft {
  return {
    fulfillmentId,
    selectedDriverMembershipId: "",
    windowStart: "",
    windowEnd: "",
    windowReason: "",
  };
}

export type DispatchCommandState =
  | { readonly status: "idle" }
  | { readonly status: "preparing"; readonly action: DispatchActionName }
  | { readonly status: "submitting"; readonly action: DispatchActionName }
  | {
      readonly status: "error";
      readonly action: DispatchActionName;
      readonly payload: unknown;
      readonly etag: string;
      readonly key: string | null;
      readonly storageKey: string | null;
      readonly message: string;
    }
  | {
      readonly status: "success";
      readonly action: DispatchActionName;
      readonly message: string;
    };

export type DispatchPlannerState =
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
      readonly readiness: DispatchReadinessResponse;
      readonly fulfillment: FulfillmentResponse;
      readonly etag: string | null;
      readonly allocation: PhysicalAllocationResponse;
      readonly assignment: DriverAssignmentResponse | null;
      readonly assignmentEtag: string | null;
      readonly assignees: readonly DispatchAssigneeResponse[];
      readonly outgoingCheck: DispatchOutgoingGoodsCheckSummaryResponse | null;
      readonly command: DispatchCommandState;
    }
  | {
      readonly status: "error";
      readonly id: string;
      readonly lease: PlatformSessionLease;
      readonly message: string;
      readonly retryable: boolean;
    };

const SESSION_CHANGED_MESSAGE =
  "The active Platform context changed before dispatch work could be updated.";

/** Owns dispatch snapshots and the versioned plan, assignment, check and handoff commands. */
@Injectable()
export class PlatformDispatchPlannerStore {
  private readonly reads = inject(NexaFulfillmentReadinessApi);
  private readonly commands = inject(NexaFulfillmentDeliveryApi);
  private readonly retries = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private requestVersion = 0;
  private lastReadiness: DispatchReadinessResponse | null = null;
  private lastLease: PlatformSessionLease | null = null;
  private readonly form = signal<DispatchFormDraft>(emptyDispatchDraft());
  private readonly snapshot = signal<DispatchPlannerState>({ status: "idle" });

  readonly state = computed<DispatchPlannerState>(() => {
    const current = this.snapshot();
    if (current.status === "idle") return current;
    if (this.sessions.isSessionLeaseCurrent(current.lease)) return current;
    return {
      status: "error",
      id: current.id,
      lease: current.lease,
      message: SESSION_CHANGED_MESSAGE,
      retryable: this.sessions.captureSessionLease() !== null,
    };
  });

  readonly canRead = computed(() => this.hasPermission("dispatch.read"));
  readonly canAssign = computed(() => this.hasPermission("dispatch.assign"));
  readonly canSchedule = computed(() => this.hasPermission("dispatch.schedule"));
  readonly canReadAssignees = computed(() =>
    this.hasPermission("logistics.read"),
  );
  readonly canCompleteHandoff = computed(() =>
    this.hasPermission("dispatch.complete"),
  );

  clear(): void {
    this.requestVersion += 1;
    this.lastReadiness = null;
    this.lastLease = null;
    this.form.set(emptyDispatchDraft());
    this.snapshot.set({ status: "idle" });
  }

  inspect(
    readiness: DispatchReadinessResponse,
    lease: PlatformSessionLease,
  ): void {
    const id = readiness.fulfillmentId;
    const requestVersion = ++this.requestVersion;
    if (!this.sessions.isSessionLeaseCurrent(lease)) {
      this.clear();
      return;
    }
    this.lastReadiness = readiness;
    this.lastLease = lease;
    this.form.set(emptyDispatchDraft(id));
    this.snapshot.set({ status: "loading", id, lease });
    forkJoin({
      fulfillment: this.reads.getFulfillment(id),
      allocation: this.reads.getPhysicalAllocation(id),
      assignment: this.commands.getCurrentDriverAssignment(id),
      outgoingCheck: this.commands.getCurrentDispatchOutgoingGoodsCheckSummary(id),
      assignees: this.canReadAssignees()
        ? this.commands.listDispatchAssignees()
        : of<readonly DispatchAssigneeResponse[]>([]),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ fulfillment, allocation, assignment, outgoingCheck, assignees }) => {
          if (!this.isLoadCurrent(id, requestVersion, lease)) return;
          if (
            fulfillment.body.id !== id ||
            fulfillment.body.version !== readiness.fulfillmentVersion ||
            fulfillment.body.physicalAllocationId !== allocation.body.allocationId ||
            allocation.body.allocationId !== readiness.physicalAllocationId ||
            allocation.body.version !== readiness.physicalAllocationVersion
          ) {
            this.snapshot.set({
              status: "error",
              id,
              lease,
              message:
                "The current fulfillment and allocation do not match the dispatch readiness snapshot.",
              retryable: false,
            });
            return;
          }
          this.snapshot.set({
            status: "ready",
            id,
            lease,
            readiness,
            fulfillment: fulfillment.body,
            etag: versionEtag(fulfillment.etag, fulfillment.body.version),
            allocation: allocation.body,
            assignment: assignment?.body ?? null,
            assignmentEtag: assignment?.etag ?? null,
            assignees,
            outgoingCheck: outgoingCheck?.body ?? null,
            command: { status: "idle" },
          });
        },
        error: (error: unknown) => {
          if (!this.isLoadCurrent(id, requestVersion, lease)) return;
          this.handleSessionError(error, lease);
          this.snapshot.set({
            status: "error",
            id,
            lease,
            message: fulfillmentApiErrorMessage(error),
            retryable: !(error instanceof NexaApiError && error.kind === "forbidden"),
          });
        },
      });
  }

  reload(): void {
    if (!this.lastReadiness || !this.lastLease) return;
    this.inspect(this.lastReadiness, this.lastLease);
  }

  dispatchForm(fulfillmentId: string): DispatchFormDraft {
    return this.formFor(fulfillmentId);
  }

  setDispatchAssignee(value: string): void {
    const dispatch = this.currentInspection();
    if (!dispatch) return;
    this.form.set({
      ...this.formFor(dispatch.id),
      fulfillmentId: dispatch.id,
      selectedDriverMembershipId: value,
    });
  }

  setDispatchWindow(field: "windowStart" | "windowEnd", value: string): void {
    const dispatch = this.currentInspection();
    if (!dispatch) return;
    this.form.set({
      ...this.formFor(dispatch.id),
      fulfillmentId: dispatch.id,
      [field]: value,
    });
  }

  setDispatchWindowReason(value: string): void {
    const dispatch = this.currentInspection();
    if (!dispatch) return;
    this.form.set({
      ...this.formFor(dispatch.id),
      fulfillmentId: dispatch.id,
      windowReason: value,
    });
  }

  canAssignDriver(
    dispatch: Extract<DispatchPlannerState, { status: "ready" }>,
  ): boolean {
    const draft = this.formFor(dispatch.id);
    return (
      this.canRead() &&
      this.canAssign() &&
      this.canReadAssignees() &&
      versionEtag(dispatch.etag, dispatch.fulfillment.version) !== null &&
      dispatch.fulfillment.status === "READY_FOR_DISPATCH" &&
      dispatch.assignment === null &&
      dispatch.readiness.windowStart !== null &&
      dispatch.readiness.windowEnd !== null &&
      dispatch.assignees.some(
        (assignee) => assignee.id === draft.selectedDriverMembershipId,
      ) &&
      !this.isCommandLocked(dispatch.command)
    );
  }

  canPlanDispatchWindow(
    dispatch: Extract<DispatchPlannerState, { status: "ready" }>,
  ): boolean {
    const draft = this.formFor(dispatch.id);
    const start = parseLocalDateTime(draft.windowStart);
    const end = parseLocalDateTime(draft.windowEnd);
    return (
      this.canRead() &&
      this.canSchedule() &&
      versionEtag(dispatch.etag, dispatch.fulfillment.version) !== null &&
      dispatch.fulfillment.status === "READY_FOR_DISPATCH" &&
      dispatch.assignment === null &&
      dispatch.readiness.windowStart === null &&
      dispatch.readiness.windowEnd === null &&
      start !== null &&
      end !== null &&
      start < end &&
      draft.windowReason.trim().length > 0 &&
      !this.isCommandLocked(dispatch.command)
    );
  }

  canDispatch(
    dispatch: Extract<DispatchPlannerState, { status: "ready" }>,
  ): boolean {
    const assignment = dispatch.assignment;
    const check = dispatch.outgoingCheck;
    return (
      this.canRead() &&
      this.canCompleteHandoff() &&
      versionEtag(dispatch.etag, dispatch.fulfillment.version) !== null &&
      dispatch.fulfillment.status === "READY_FOR_DISPATCH" &&
      assignment?.current === true &&
      assignment.fulfillmentVersion === dispatch.fulfillment.version &&
      assignment.physicalAllocationId === dispatch.allocation.allocationId &&
      assignment.physicalAllocationVersion === dispatch.allocation.version &&
      check?.current === true &&
      check.matches === true &&
      check.fulfillmentVersion === dispatch.fulfillment.version &&
      check.physicalAllocationId === dispatch.allocation.allocationId &&
      check.physicalAllocationVersion === dispatch.allocation.version &&
      !check.openDiscrepancy &&
      !this.isCommandLocked(dispatch.command)
    );
  }

  isCommandLocked(command: DispatchCommandState): boolean {
    return (
      command.status === "preparing" ||
      command.status === "submitting" ||
      command.status === "error"
    );
  }

  assignDriver(): Promise<boolean> {
    const dispatch = this.currentInspection();
    if (!dispatch || !this.canAssignDriver(dispatch)) return Promise.resolve(false);
    return this.execute("driver-assignment");
  }

  planDispatchWindow(): Promise<boolean> {
    const dispatch = this.currentInspection();
    if (!dispatch || !this.canPlanDispatchWindow(dispatch)) return Promise.resolve(false);
    return this.execute("dispatch-window-plan");
  }

  dispatchFulfillment(): Promise<boolean> {
    const dispatch = this.currentInspection();
    if (!dispatch || !this.canDispatch(dispatch)) return Promise.resolve(false);
    return this.execute("dispatch-handoff");
  }

  async execute(action: DispatchActionName): Promise<boolean> {
    const current = this.state();
    if (
      current.status !== "ready" ||
      !this.canExecute(action, current) ||
      !this.sessions.isSessionLeaseCurrent(current.lease) ||
      this.isCommandLocked(current.command)
    ) {
      return false;
    }
    const currentEtag = versionEtag(current.etag, current.fulfillment.version);
    if (!currentEtag) return false;
    const body = immutablePayload(this.commandPayload(action, current));
    if (body === null || !this.canExecute(action, current)) return false;
    const requestVersion = this.requestVersion;
    this.setCommand(current.id, { status: "preparing", action });
    let identity;
    try {
      identity = await fulfillmentCommandRetryIdentity(
        this.retries,
        this.sessions,
        current.lease,
        current.id,
        action,
        currentEtag,
        body,
      );
    } catch {
      identity = null;
    }
    if (!this.isCommandCurrent(current.id, requestVersion, current.lease)) {
      return false;
    }
    if (!identity) {
      this.setCommandError(
        current.id,
        action,
        body,
        currentEtag,
        null,
        null,
        "This browser could not preserve a scoped retry key. The command was not sent.",
      );
      return false;
    }
    return this.send(
      current.id,
      action,
      body,
      currentEtag,
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
      !this.canExecute(current.command.action, current) ||
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

  private canExecute(
    action: DispatchActionName,
    state: Extract<DispatchPlannerState, { status: "ready" }>,
  ): boolean {
    switch (action) {
      case "driver-assignment":
        return (
          this.canRead() &&
          this.canAssign() &&
          this.canReadAssignees() &&
          state.fulfillment.status === "READY_FOR_DISPATCH" &&
          state.assignment === null &&
          state.assignees.some(
            (assignee) =>
              assignee.id === this.formFor(state.id).selectedDriverMembershipId,
          )
        );
      case "dispatch-window-plan":
        return this.canRead() && this.canSchedule() && this.dispatchWindowRequest(state) !== null;
      case "dispatch-handoff":
        return this.canRead() && this.canCompleteHandoff() && this.dispatchRequest(state) !== null;
    }
  }

  private commandPayload(
    action: DispatchActionName,
    state: Extract<DispatchPlannerState, { status: "ready" }>,
  ): unknown {
    switch (action) {
      case "driver-assignment":
        return this.driverAssignmentRequest(state);
      case "dispatch-window-plan":
        return this.dispatchWindowRequest(state);
      case "dispatch-handoff":
        return this.dispatchRequest(state);
    }
  }

  private driverAssignmentRequest(
    state: Extract<DispatchPlannerState, { status: "ready" }>,
  ): AssignDriverRequest | null {
    const responsibleMembershipId = this.formFor(state.id).selectedDriverMembershipId;
    if (!state.assignees.some((assignee) => assignee.id === responsibleMembershipId)) {
      return null;
    }
    return {
      responsibleMembershipId,
      physicalAllocationId: state.allocation.allocationId,
      physicalAllocationVersion: state.allocation.version,
    };
  }

  private dispatchWindowRequest(
    state: Extract<DispatchPlannerState, { status: "ready" }>,
  ): DispatchWindowPlanRequest | null {
    if (
      state.fulfillment.status !== "READY_FOR_DISPATCH" ||
      state.assignment !== null ||
      state.readiness.windowStart !== null ||
      state.readiness.windowEnd !== null
    ) {
      return null;
    }
    const draft = this.formFor(state.id);
    const start = parseLocalDateTime(draft.windowStart);
    const end = parseLocalDateTime(draft.windowEnd);
    const reason = draft.windowReason.trim();
    if (!start || !end || start >= end || !reason) return null;
    return { windowStart: start.toISOString(), windowEnd: end.toISOString(), reason };
  }

  private dispatchRequest(
    state: Extract<DispatchPlannerState, { status: "ready" }>,
  ): DispatchRequest | null {
    const assignment = state.assignment;
    const check = state.outgoingCheck;
    if (
      state.fulfillment.status !== "READY_FOR_DISPATCH" ||
      assignment?.current !== true ||
      assignment.fulfillmentVersion !== state.fulfillment.version ||
      assignment.physicalAllocationId !== state.allocation.allocationId ||
      assignment.physicalAllocationVersion !== state.allocation.version ||
      check?.current !== true ||
      check.matches !== true ||
      check.fulfillmentVersion !== state.fulfillment.version ||
      check.physicalAllocationId !== state.allocation.allocationId ||
      check.physicalAllocationVersion !== state.allocation.version ||
      check.openDiscrepancy
    ) {
      return null;
    }
    return {
      physicalAllocationId: state.allocation.allocationId,
      physicalAllocationVersion: state.allocation.version,
      driverAssignmentId: assignment.id,
      driverAssignmentVersion: assignment.fulfillmentVersion,
      outgoingGoodsCheckId: check.id,
    };
  }

  private formFor(fulfillmentId: string): DispatchFormDraft {
    const current = this.form();
    return current.fulfillmentId === fulfillmentId
      ? current
      : emptyDispatchDraft(fulfillmentId);
  }

  private currentInspection():
    | Extract<DispatchPlannerState, { status: "ready" }>
    | null {
    const current = this.state();
    return current.status === "ready" ? current : null;
  }

  private async send(
    fulfillmentId: string,
    action: DispatchActionName,
    payload: unknown,
    etag: string,
    key: string,
    storageKey: string,
    lease: PlatformSessionLease,
    requestVersion: number,
  ): Promise<boolean> {
    if (!this.isCommandCurrent(fulfillmentId, requestVersion, lease)) return false;
    const current = this.snapshot();
    if (current.status !== "ready" || !this.canExecute(action, current)) return false;
    this.setCommand(fulfillmentId, { status: "submitting", action });
    try {
      const result = await firstValueFrom(
        this.commandRequest(fulfillmentId, action, etag, key, payload).pipe(
          takeUntilDestroyed(this.destroyRef),
        ),
      );
      if (!this.isCommandCurrent(fulfillmentId, requestVersion, lease)) return false;
      const responseFulfillmentId =
        action === "dispatch-handoff"
          ? (result.body as FulfillmentResponse).id
          : (result.body as { readonly fulfillmentId: string }).fulfillmentId;
      if (responseFulfillmentId !== fulfillmentId) {
        this.setCommandError(
          fulfillmentId,
          action,
          payload,
          etag,
          key,
          storageKey,
          "The API response did not match this fulfillment. Reload dispatch state before continuing.",
        );
        return false;
      }
      this.retries.remove(storageKey);
      this.applyCommandResult(action, result.body, result.etag);
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
    action: DispatchActionName,
    etag: string,
    key: string,
    payload: unknown,
  ): Observable<DispatchCommandResponse> {
    switch (action) {
      case "driver-assignment":
        return this.commands.assignDriver(
          fulfillmentId,
          etag,
          key,
          payload as AssignDriverRequest,
        );
      case "dispatch-window-plan":
        return this.commands.planDispatchWindow(
          fulfillmentId,
          etag,
          key,
          payload as DispatchWindowPlanRequest,
        );
      case "dispatch-handoff":
        return this.commands.dispatch(
          fulfillmentId,
          etag,
          key,
          payload as DispatchRequest,
        );
    }
  }

  private applyCommandResult(
    action: DispatchActionName,
    body: DispatchCommandResponse["body"],
    etag: string | null,
  ): void {
    this.snapshot.update((current) => {
      if (current.status !== "ready") return current;
      let updated = current;
      switch (action) {
        case "driver-assignment": {
          const assignment = body as DriverAssignmentResponse;
          const currentEtag = versionEtag(etag, assignment.fulfillmentVersion);
          updated = {
            ...updated,
            assignment,
            assignmentEtag: currentEtag,
            etag: currentEtag,
            fulfillment: {
              ...updated.fulfillment,
              version: assignment.fulfillmentVersion,
            },
            outgoingCheck: updated.outgoingCheck
              ? { ...updated.outgoingCheck, current: false }
              : null,
          };
          break;
        }
        case "dispatch-window-plan": {
          const plan = body as DispatchWindowPlanResponse;
          const currentEtag = versionEtag(etag, plan.fulfillmentVersion);
          updated = {
            ...updated,
            etag: currentEtag,
            fulfillment: {
              ...updated.fulfillment,
              version: plan.fulfillmentVersion,
            },
            readiness: {
              ...updated.readiness,
              fulfillmentVersion: plan.fulfillmentVersion,
              windowStart: plan.windowStart,
              windowEnd: plan.windowEnd,
              windowSource: "DISPATCH_PLAN",
            },
          };
          break;
        }
        case "dispatch-handoff": {
          const fulfillment = body as FulfillmentResponse;
          updated = {
            ...updated,
            fulfillment,
            etag: versionEtag(etag, fulfillment.version),
          };
          break;
        }
      }
      return {
        ...updated,
        command: {
          status: "success",
          action,
          message: dispatchActionSuccessMessage(action),
        },
      };
    });
  }

  private setCommand(
    id: string,
    command: DispatchCommandState,
  ): void {
    this.snapshot.update((current) =>
      current.status === "ready" && current.id === id
        ? { ...current, command }
        : current,
    );
  }

  private setCommandError(
    id: string,
    action: DispatchActionName,
    payload: unknown,
    etag: string,
    key: string | null,
    storageKey: string | null,
    message: string,
  ): void {
    this.setCommand(id, {
      status: "error",
      action,
      payload,
      etag,
      key,
      storageKey,
      message,
    });
  }

  private hasPermission(permission: string): boolean {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      current.session.membership?.permissions?.includes(permission) === true
    );
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

type DispatchCommandResponse = {
  readonly body:
    | DriverAssignmentResponse
    | DispatchWindowPlanResponse
    | FulfillmentResponse;
  readonly etag: string | null;
};

function parseLocalDateTime(value: string): Date | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function versionEtag(etag: string | null, version: number): string | null {
  if (!etag || !Number.isSafeInteger(version) || version < 0) return null;
  return etag === `"${version}"` ? etag : null;
}

function immutablePayload(payload: unknown): unknown {
  return payload === null ? null : JSON.parse(JSON.stringify(payload));
}

function dispatchActionSuccessMessage(action: DispatchActionName): string {
  switch (action) {
    case "driver-assignment":
      return "The API recorded the current Logistics assignment.";
    case "dispatch-window-plan":
      return "The API recorded the dispatch window. Assign a driver after planning.";
    case "dispatch-handoff":
      return "The API recorded handoff to the assigned driver.";
  }
}
