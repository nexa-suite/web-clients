export interface WalletRefundRequest {
  readonly amountPEN: number;
  readonly reason: string;
}

export interface WalletRefundResponse {
  readonly salesOrderId: string;
  readonly refundId: string;
  readonly ledgerEntryId: string;
  readonly amountPEN: number;
  readonly currency: "PEN";
  readonly status: "POSTED";
}

export interface WalletRefundCandidate {
  readonly salesOrderId: string;
  readonly orderNumber: string;
  readonly currency: "PEN";
  readonly consumedPEN: number;
  readonly refundedPEN: number;
  readonly refundablePEN: number;
}

export interface WalletRefundCandidatesPage {
  readonly items: readonly WalletRefundCandidate[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}
