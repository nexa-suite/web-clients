import { DOCUMENT } from "@angular/common";
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, inject } from "@angular/core";
import { toObservable } from "@angular/core/rxjs-interop";
import { filter, take } from "rxjs";
import type {
  DispatchReadinessResponse,
  FulfillmentCandidateResponse,
  FulfillmentWorkItemResponse,
} from "@nexa/api";
import { NexaButton, startForegroundRefresh } from "nexa-ui";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformDispatchPlannerStore } from "../application/platform-dispatch-planner.store";
import { PlatformFulfillmentWorkbenchStore } from "../application/platform-fulfillment-workbench.store";
import { PlatformWarehouseLifecycleStore } from "../application/platform-warehouse-lifecycle.store";

@Component({
  selector: "platform-fulfillment-delivery",
  standalone: true,
  imports: [NexaButton],
  providers: [
    PlatformFulfillmentWorkbenchStore,
    PlatformWarehouseLifecycleStore,
    PlatformDispatchPlannerStore,
  ],
  templateUrl: "./platform-fulfillment-delivery.component.html",
  styleUrl: "./platform-fulfillment-delivery.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformFulfillmentDeliveryComponent implements OnInit {
  protected readonly workbench = inject(PlatformFulfillmentWorkbenchStore);
  protected readonly warehouseStore = inject(PlatformWarehouseLifecycleStore);
  protected readonly dispatchStore = inject(PlatformDispatchPlannerStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  protected readonly state = this.workbench.state;
  protected readonly hasFulfillmentManage = this.workbench.hasFulfillmentManage;

  ngOnInit(): void {
    this.refresh();
    this.startPolling();
  }

  protected refresh(): void {
    this.warehouseStore.clear();
    this.dispatchStore.clear();
    this.workbench.refresh();
  }

  protected changeCandidatePage(offset: number): void {
    if (!this.workbench.canChangeCandidatePage()) return;
    this.warehouseStore.clear();
    this.dispatchStore.clear();
    this.workbench.changeCandidatePage(offset);
  }

  protected inspectWork(item: FulfillmentWorkItemResponse): void {
    const lease = this.workbench.state().lease;
    if (!lease) {
      this.workbench.refresh();
      return;
    }
    const current = this.warehouseStore.state();
    if (current.status !== "idle" && current.id === item.fulfillmentId) {
      this.warehouseStore.clear();
      return;
    }
    this.warehouseStore.inspect(item.fulfillmentId, lease, item.physicalAllocationId);
  }

  protected reloadWarehouseInspection(): void {
    const current = this.warehouseStore.state();
    if (current.status === "idle" || this.workbench.state().lease === null) {
      this.refresh();
    }
    else this.warehouseStore.reload();
  }

  protected inspectDispatch(readiness: DispatchReadinessResponse): void {
    const lease = this.workbench.state().lease;
    if (!lease) {
      this.workbench.refresh();
      return;
    }
    const current = this.dispatchStore.state();
    if (current.status !== "idle" && current.id === readiness.fulfillmentId) {
      this.dispatchStore.clear();
      return;
    }
    this.dispatchStore.inspect(readiness, lease);
  }

  protected reloadDispatchInspection(): void {
    const current = this.dispatchStore.state();
    if (current.status === "idle" || this.workbench.state().lease === null) {
      this.refresh();
    }
    else this.dispatchStore.reload();
  }

  protected openOrder(
    candidate: FulfillmentCandidateResponse,
    preserveStart = false,
  ): void {
    this.workbench.openOrder(candidate, preserveStart);
  }

  protected retryOrder(id: string): void {
    this.workbench.retryOrder(id);
  }

  protected startFulfillment(): void {
    this.workbench.startFulfillment();
  }

  protected startPicking(): void {
    this.runWarehouseCommand(() => this.warehouseStore.startPicking());
  }

  protected confirmPicking(): void {
    this.runWarehouseCommand(() => this.warehouseStore.confirmPicking());
  }

  protected resolveShortage(): void {
    this.runWarehouseCommand(() => this.warehouseStore.resolveShortage());
  }

  protected packFulfillment(): void {
    this.runWarehouseCommand(() => this.warehouseStore.packFulfillment());
  }

  protected stageFulfillment(): void {
    this.runWarehouseCommand(() => this.warehouseStore.stageFulfillment());
  }

  protected markReadyForDispatch(): void {
    this.runWarehouseCommand(() => this.warehouseStore.markReadyForDispatch());
  }

  protected retryFulfillmentCommand(): void {
    this.runWarehouseCommand(() => this.warehouseStore.retry());
  }

  protected assignDriver(): void {
    this.runDispatchCommand(() => this.dispatchStore.assignDriver());
  }

  protected planDispatchWindow(): void {
    this.runDispatchCommand(() => this.dispatchStore.planDispatchWindow());
  }

  protected recordWarehouseOutgoingCheck(): void {
    this.runWarehouseCommand(() => this.warehouseStore.recordOutgoingGoodsCheck());
  }

  protected dispatchFulfillment(): void {
    this.runDispatchCommand(() => this.dispatchStore.dispatchFulfillment());
  }

  protected sealDeliveryPod(): void {
    this.runDispatchCommand(() => this.dispatchStore.sealPod());
  }

  protected retryPodSealCommand(): void {
    this.runDispatchCommand(() => this.dispatchStore.retryPodSeal());
  }

  protected retryDispatchCommand(): void {
    this.runDispatchCommand(() => this.dispatchStore.retry());
  }

  private runWarehouseCommand(action: () => Promise<boolean>): void {
    const current = this.warehouseStore.state();
    if (current.status !== "ready") return;
    void action().then((succeeded) => {
      if (succeeded) this.workbench.refreshBoards(current.lease);
    });
  }

  private runDispatchCommand(action: () => Promise<boolean>): void {
    const current = this.dispatchStore.state();
    if (current.status !== "ready") return;
    void action().then((succeeded) => {
      if (succeeded) this.workbench.refreshBoards(current.lease);
    });
  }

  private startPolling(): void {
    const lease = this.workbench.state().lease;
    if (!lease) return;
    const stopWhen = toObservable(this.sessions.state, { injector: this.injector }).pipe(
      filter(() => !this.sessions.isSessionLeaseCurrent(lease)),
      take(1),
    );
    startForegroundRefresh({
      document: this.document,
      destroyRef: this.destroyRef,
      stopWhen,
      refresh: () => this.workbench.refreshBoardsForPolling(lease),
    });
  }
}
