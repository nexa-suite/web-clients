/** Buyer-safe Delivery projection; the API derives account scope from authority. */
export interface BuyerDeliveryResponse {
  readonly id: string;
  readonly salesOrderNumber: string;
  readonly status: string;
  readonly destination: string | null;
  readonly scheduledAt: string | null;
  readonly dispatchedAt: string | null;
  readonly deliveredAt: string | null;
  readonly proofOfDeliveryStatus: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface BuyerDeliveryPageResponse {
  readonly items: readonly BuyerDeliveryResponse[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}
export interface BuyerDeliveryEventResponse {
  readonly type: string;
  readonly occurredAt: string;
}
