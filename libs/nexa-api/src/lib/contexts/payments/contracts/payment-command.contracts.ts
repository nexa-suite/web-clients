export interface PaymentResponse {
  readonly id: string;
  readonly receivableId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: number;
  readonly currency: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface BankTransferReportRequest {
  readonly reference: string;
  readonly proofEvidenceId: string | null;
}
