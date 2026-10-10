import { ChangeDetectionStrategy, Component, OnInit, inject } from "@angular/core";
import type {
  DispatchReadinessResponse,
  FulfillmentCandidateResponse,
  FulfillmentWorkItemResponse,
} from "@nexa/api";
import { NexaButton } from "nexa-ui";
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

  protected readonly state = this.workbench.state;
  protected readonly hasFulfillmentManage = this.workbench.hasFulfillmentManage;

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.warehouseStore.clear();
    this.dispatchStore.clear();
    this.workbench.refresh();
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
}
