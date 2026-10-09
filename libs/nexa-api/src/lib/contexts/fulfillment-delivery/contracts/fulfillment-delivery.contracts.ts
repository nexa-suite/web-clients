export const NEXA_FULFILLMENT_DELIVERY_API_PATHS = {
  salesOrders: "/sales-orders",
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
