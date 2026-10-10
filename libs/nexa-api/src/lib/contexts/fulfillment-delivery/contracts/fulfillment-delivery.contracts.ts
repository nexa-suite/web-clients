export const NEXA_FULFILLMENT_DELIVERY_API_PATHS = {
  salesOrders: "/sales-orders",
  fulfillments: "/fulfillments",
  dispatchAssignees: "/dispatch-assignees",
} as const;

export type FulfillmentStatus =
  | "PLANNED"
  | "ALLOCATED"
  | "PICKING"
  | "PICKED"
  | "PACKED"
  | "STAGED"
  | "READY_FOR_DISPATCH"
  | "HANDED_OVER"
  | "COMPLETED"
  | "SHORTAGE"
  | "HOLD"
  | "CANCELLED";

export interface FulfillmentResponse {
  readonly id: string;
  readonly salesOrderId: string;
  readonly physicalAllocationId: string;
  readonly status: FulfillmentStatus;
  readonly destinationSnapshot: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deliveryId: string | null;
  readonly deliveryStatus: string | null;
  readonly deliveryVersion: number;
  readonly lines: readonly FulfillmentLineResponse[];
}

export interface FulfillmentLineResponse {
  readonly id: string;
  readonly skuId: string;
  readonly catalogItemId: string;
  readonly orderedQuantity: number;
  readonly backedQuantity: number;
  readonly allocatedQuantity: number;
  readonly pickedQuantity: number;
  readonly packedQuantity: number;
  readonly stagedQuantity: number;
  readonly dispatchedQuantity: number;
  readonly deliveredQuantity: number;
  readonly rejectedQuantity: number;
  readonly cancelledQuantity: number;
  readonly unfulfilledQuantity: number;
  readonly remainingQuantity: number;
  readonly unit: string;
}

export interface StartFulfillmentResponse {
  readonly body: FulfillmentResponse;
  readonly etag: string | null;
}

export interface FulfillmentResourceResponse {
  readonly body: FulfillmentResponse;
  readonly etag: string | null;
}

export interface PickingLineRequest {
  readonly fulfillmentLineId: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly unit: string;
  readonly physicalAllocationLineId?: string | null;
  readonly lotId?: string | null;
  readonly warehouseId?: string | null;
  readonly fefoOverride?: boolean;
  readonly fefoOverrideReason?: string | null;
}

export interface ConfirmPickingRequest {
  readonly pickerIdentityId: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly allocationVersion: number;
  readonly notes: string | null;
  readonly lines: readonly PickingLineRequest[];
}

export interface ResolveShortageRequest {
  readonly reason: string;
  readonly lines: readonly {
    readonly fulfillmentLineId: string;
    readonly skuId: string;
    readonly quantity: number;
    readonly unit: string;
  }[];
}

export interface DriverAssignmentResponse {
  readonly id: string;
  readonly fulfillmentId: string;
  readonly fulfillmentVersion: number;
  readonly physicalAllocationId: string;
  readonly physicalAllocationVersion: number;
  readonly responsibleMembershipId: string;
  readonly responsibleDisplayName: string;
  readonly assignedAt: string;
  readonly plannedDispatchAt: string | null;
  readonly deliveryId: string | null;
  readonly current: boolean;
}

export interface DispatchAssigneeResponse {
  readonly id: string;
  readonly displayName: string;
}

export interface AssignDriverRequest {
  readonly responsibleMembershipId: string;
  readonly physicalAllocationId: string;
  readonly physicalAllocationVersion: number;
}

export interface OutgoingGoodsObservationRequest {
  readonly physicalAllocationLineId: string;
  readonly observedLotId: string | null;
  readonly observedQuantity: number;
}

export interface RecordOutgoingGoodsCheckRequest {
  readonly physicalAllocationId: string;
  readonly physicalAllocationVersion: number;
  readonly observations: readonly OutgoingGoodsObservationRequest[];
}

export interface OutgoingGoodsCheckResponse {
  readonly id: string;
  readonly fulfillmentId: string;
  readonly fulfillmentVersion: number;
  readonly physicalAllocationId: string;
  readonly physicalAllocationVersion: number;
  readonly matches: boolean;
  readonly current: boolean;
  readonly openDiscrepancy: boolean;
  readonly checkedByMembershipId: string;
  readonly checkedAt: string;
  readonly lines: readonly {
    readonly physicalAllocationLineId: string;
    readonly skuId: string;
    readonly expectedLotId: string;
    readonly observedLotId: string | null;
    readonly expectedQuantity: number;
    readonly observedQuantity: number;
    readonly unit: string;
    readonly matches: boolean;
  }[];
  readonly replayed: boolean;
  readonly discrepancy: unknown | null;
}

/** Minimal current Warehouse evidence facts exposed to scoped Dispatch readers. */
export interface DispatchOutgoingGoodsCheckSummaryResponse {
  readonly id: string;
  readonly fulfillmentId: string;
  readonly fulfillmentVersion: number;
  readonly physicalAllocationId: string;
  readonly physicalAllocationVersion: number;
  readonly matches: boolean;
  readonly current: boolean;
  readonly openDiscrepancy: boolean;
}

export interface DispatchRequest {
  readonly physicalAllocationId: string;
  readonly physicalAllocationVersion: number;
  readonly driverAssignmentId: string;
  readonly driverAssignmentVersion: number;
  readonly outgoingGoodsCheckId: string;
}

export interface DispatchWindowPlanRequest {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly reason: string;
}

export interface DispatchWindowPlanResponse {
  readonly fulfillmentId: string;
  readonly fulfillmentVersion: number;
  readonly revision: number;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly reason: string;
  readonly recordedByMembershipId: string;
  readonly recordedAt: string;
  readonly replayed: boolean;
}
