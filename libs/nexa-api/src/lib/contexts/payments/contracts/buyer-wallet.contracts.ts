export interface BuyerWalletMovementResponse {
  readonly type: string;
  readonly amountDelta: number;
  readonly occurredAt: string;
}

export interface BuyerWalletMovementPageResponse {
  readonly items: readonly BuyerWalletMovementResponse[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface BuyerWalletCapabilitiesResponse {
  /** Server feature support only; does not promise funding or purchase approval. */
  readonly orderPaymentSupported: boolean;
}

export interface BuyerWalletActiveResponse {
  readonly status: "ACTIVE";
  readonly currency: string;
  readonly postedBalance: number;
  readonly reservedBalance: number;
  readonly availableBalance: number;
  readonly movements: BuyerWalletMovementPageResponse;
  readonly capabilities?: BuyerWalletCapabilitiesResponse;
}

export interface BuyerWalletNotInitializedResponse {
  readonly status: "NOT_INITIALIZED";
  readonly currency: string;
  readonly postedBalance: null;
  readonly reservedBalance: null;
  readonly availableBalance: null;
  readonly movements: BuyerWalletMovementPageResponse;
  readonly capabilities?: BuyerWalletCapabilitiesResponse;
}

export type BuyerWalletResponse =
  | BuyerWalletActiveResponse
  | BuyerWalletNotInitializedResponse;

export type BuyerWalletRechargeStatus =
  | "PREPARING"
  | "AWAITING_PAYMENT"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "REJECTED";

interface BuyerWalletRechargeFields {
  readonly id: string;
  readonly status: BuyerWalletRechargeStatus;
  readonly amount: number;
  readonly currency: string;
  readonly provider: string;
  readonly providerPaymentIntentId: string | null;
  readonly createdAt: string;
}

/** One-time creation response. Keep clientSecret only in the immediate checkout flow. */
export interface BuyerWalletRechargeCreatedResponse extends BuyerWalletRechargeFields {
  readonly clientSecret: string | null;
}

/** Status reads never return the provider client secret. */
export interface BuyerWalletRechargeStatusResponse extends BuyerWalletRechargeFields {
  readonly updatedAt: string;
  readonly completedAt: string | null;
}
