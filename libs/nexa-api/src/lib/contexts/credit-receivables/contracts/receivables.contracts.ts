export interface ReceivableResponse {
  readonly id: string;
  readonly clientAccountId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly number: string;
  readonly currency: string;
  readonly amount: number;
  readonly amountPaid: number;
  readonly remaining: number;
  readonly status: string;
  readonly dueAt: string | null;
  readonly version: number;
}
export interface ReceivablesPageResponse {
  readonly items: readonly ReceivableResponse[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface BuyerCreditExposureResponse {
  readonly clientAccountId: string;
  readonly currency: string;
  readonly creditLimit: number;
  readonly ledgerExposure: number;
  readonly outstandingReceivables: number;
  readonly reservedExposure: number;
  readonly used: number;
  readonly availableCredit: number;
  readonly active: boolean;
  readonly asOf: string;
}
