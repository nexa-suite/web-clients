/** Buyer-safe projection; the API filters the account and redacts operational details. */
export interface BuyerDeliveryResponse {
  readonly id: string;
  readonly dispatchNumber: string;
  readonly salesOrderNumber: string | null;
  readonly status: string;
  readonly destination: string | null;
  readonly deliveryWindowStart: string | null;
  readonly deliveryWindowEnd: string | null;
  readonly eta: string | null;
  readonly podStatus: string | null;
  readonly updatedAt: string;
  readonly alerts: readonly string[];
  readonly continuationDeliveryStatus: string | null;
}
export interface BuyerDeliveryPageResponse {
  readonly items: readonly BuyerDeliveryResponse[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}
export interface BuyerDeliveryEventResponse {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly summary: string;
}
