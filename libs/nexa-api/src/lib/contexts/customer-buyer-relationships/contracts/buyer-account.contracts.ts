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

export interface BuyerAddressResponse {
  readonly id: string;
  readonly clientAccountId: string;
  readonly label: string;
  readonly addressType: string;
  readonly line: string;
  readonly reference: string | null;
  readonly countryCode: string;
  readonly departmentCode: string | null;
  readonly provinceCode: string | null;
  readonly districtCode: string | null;
  readonly recipientName: string | null;
  readonly recipientPhone: string | null;
  readonly roadType: string | null;
  readonly streetName: string | null;
  readonly streetNumber: string | null;
  readonly interior: string | null;
  readonly postalCode: string | null;
  readonly receivingInstructions: string | null;
  readonly receivingHours: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly placeId: string | null;
  readonly source: string | null;
  readonly defaultAddress: boolean;
  readonly active: boolean;
  readonly version: number;
}
