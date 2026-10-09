export interface CurrentBuyerAccountResponse {
  readonly id: string;
  readonly code: string;
  readonly businessName: string;
  readonly commercialName: string | null;
  readonly countryCode: string;
  readonly taxType: string;
  readonly taxValue: string;
  readonly segment: string | null;
  readonly contactPerson: string | null;
  readonly contactEmail: string | null;
  readonly phone: string | null;
  readonly deliveryProfile: string | null;
  readonly paymentCondition: string | null;
  readonly status: string;
  readonly buyerMembershipId: string | null;
  readonly version: number;
}
