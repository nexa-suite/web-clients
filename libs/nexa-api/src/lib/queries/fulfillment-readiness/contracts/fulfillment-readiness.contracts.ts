/** Current read projections used by the Platform fulfillment readiness workbench. */
import type { FulfillmentStatus } from "../../../contexts/fulfillment-delivery/public-api";

export const NEXA_FULFILLMENT_READINESS_API_PATHS = {
  orderFulfillmentCandidates: "/order-fulfillment-candidates",
  salesOrders: "/sales-orders",
  fulfillments: "/fulfillments",
  dispatchReadiness: "/dispatch-readiness",
} as const;

export interface FulfillmentCandidatePageResponse {
  readonly items: readonly FulfillmentCandidateResponse[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface FulfillmentCandidateResponse {
  readonly id: string;
  readonly number: string;
  readonly clientAccountId: string;
  readonly status: string;
  readonly version: number;
  readonly lines: readonly FulfillmentCandidateLineResponse[];
}

export interface FulfillmentCandidateLineResponse {
  readonly catalogItemId: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly unit: string;
}

/** The API ETag is returned beside this body and must be retained verbatim for commands. */
export interface SalesOrderResponse {
  readonly id: string;
  readonly number: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly clientAccountId: string;
  readonly createdByMembershipId: string;
  readonly buyerMembershipId: string;
  readonly sourcePurchaseRequestId: string | null;
  readonly priority: string;
  readonly requestedDeliveryDate: string | null;
  readonly deliverySnapshot: string | null;
  readonly paymentOption: string | null;
  readonly notes: string | null;
  readonly currency: string;
  readonly total: number;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt: string | null;
  readonly rejectedAt: string | null;
  readonly cancelledAt: string | null;
  readonly rejectionReason: string | null;
  readonly version: number;
  readonly lines: readonly SalesOrderLineResponse[];
  readonly originType: string | null;
  readonly commercialCommitmentId: string | null;
}

export interface SalesOrderLineResponse {
  readonly catalogItemId: string;
  readonly itemName: string;
  readonly presentation: string | null;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPriceAmount: number | null;
  readonly unitPriceCurrency: string | null;
  readonly lineSubtotal: number | null;
  readonly skuId: string | null;
  readonly familyId: string | null;
  readonly skuCode: string | null;
  readonly familyCode: string | null;
}

export interface FulfillmentWorkPageResponse {
  readonly items: readonly FulfillmentWorkItemResponse[];
  readonly page: number;
  readonly size: number;
  readonly totalItems: number;
  readonly asOf: string;
}

export interface FulfillmentWorkItemResponse {
  readonly fulfillmentId: string;
  readonly salesOrderId: string;
  readonly status: FulfillmentStatus;
  readonly version: number;
  readonly physicalAllocationId: string;
  readonly allocationVersion: number;
  readonly lineCount: number;
}

export interface PhysicalAllocationResponse {
  readonly allocationId: string;
  readonly status: string;
  readonly version: number;
  readonly asOf: string;
  readonly lines: readonly PhysicalAllocationLineResponse[];
}

export interface PhysicalAllocationLineResponse {
  readonly physicalAllocationLineId: string;
  readonly skuId: string;
  readonly catalogItemId: string;
  readonly warehouseId: string;
  readonly zoneId: string | null;
  readonly lotId: string | null;
  readonly quantity: number;
  readonly releasedQuantity: number;
  readonly consumedQuantity: number;
  readonly remainingQuantity: number;
  readonly unit: string;
  readonly expirationDate: string | null;
}

export interface DispatchReadinessPageResponse {
  readonly items: readonly DispatchReadinessResponse[];
  readonly page: number;
  readonly size: number;
  readonly totalItems: number;
  readonly asOf: string;
}

export interface DispatchReadinessResponse {
  readonly subjectKind: string;
  readonly fulfillmentId: string;
  readonly fulfillmentVersion: number;
  readonly fulfillmentStatus: FulfillmentStatus;
  readonly physicalAllocationId: string;
  readonly physicalAllocationStatus: string;
  readonly physicalAllocationVersion: number;
  readonly deliveryId: string | null;
  readonly deliveryStatus: string | null;
  readonly deliveryVersion: number | null;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  readonly windowSource: string | null;
  readonly allocationComplete: boolean;
  readonly pickingComplete: boolean;
  readonly pickingEvidenceComplete: boolean;
  readonly ready: boolean;
  readonly reasons: readonly string[];
  readonly lines: readonly DispatchReadinessLineResponse[];
  readonly asOf: string;
}

export interface DispatchReadinessLineResponse {
  readonly fulfillmentLineId: string;
  readonly skuId: string;
  readonly catalogItemId: string;
  readonly allocatedQuantity: number;
  readonly physicallyAllocatedQuantity: number;
  readonly pickedQuantity: number;
  readonly evidencedPickedQuantity: number;
  readonly allocationComplete: boolean;
  readonly pickingComplete: boolean;
  readonly evidenceComplete: boolean;
}

export interface NexaResourceResponse<T> {
  readonly body: T;
  readonly etag: string | null;
}
