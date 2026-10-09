export interface PaymentHistoryResponse {
  readonly id: string;
  readonly receivableId: string;
  readonly receivableNumber: string | null;
  readonly clientAccountId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: number;
  readonly currency: string;
  readonly reference: string | null;
  readonly reviewReason: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}
export interface PaymentHistoryPageResponse {
  readonly items: readonly PaymentHistoryResponse[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}
