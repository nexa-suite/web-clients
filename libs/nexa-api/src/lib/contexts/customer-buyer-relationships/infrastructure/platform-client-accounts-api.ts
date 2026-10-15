import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";

export interface ClientAccountSummary {
  id: string;
  code: string;
  businessName: string;
  commercialName: string;
  segment: string;
  status: string;
  buyerMembershipId: string | null;
  version: number;
}
export interface ClientAccountDetail extends ClientAccountSummary {
  countryCode: string;
  taxType: string;
  taxValue: string;
  contactPerson: string;
  contactEmail: string;
  phone: string;
  deliveryProfile: string;
  paymentCondition: string;
}
export interface ClientAccountPage {
  items: ClientAccountSummary[];
  page: number;
  size: number;
  total: number;
}
export type CreateClientAccount = Pick<
  ClientAccountDetail,
  | "code"
  | "businessName"
  | "commercialName"
  | "countryCode"
  | "taxType"
  | "taxValue"
  | "segment"
  | "contactPerson"
  | "contactEmail"
  | "phone"
  | "deliveryProfile"
  | "paymentCondition"
>;
export type UpdateClientAccount = Pick<
  ClientAccountDetail,
  | "businessName"
  | "commercialName"
  | "contactPerson"
  | "contactEmail"
  | "phone"
  | "deliveryProfile"
  | "paymentCondition"
>;
export interface BuyerMembershipCandidate {
  id: string;
  email: string;
  displayName: string;
}

export interface ClientAddress {
  id: string;
  clientAccountId: string;
  label: string;
  addressType: string | null;
  line: string;
  reference: string | null;
  countryCode: string;
  departmentCode: string;
  provinceCode: string;
  districtCode: string;
  recipientName: string | null;
  recipientPhone: string | null;
  roadType: string | null;
  streetName: string | null;
  streetNumber: string | null;
  interior: string | null;
  postalCode: string | null;
  receivingInstructions: string | null;
  receivingHours: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  source: string | null;
  defaultAddress: boolean;
  active: boolean;
  version: number;
}
export type DeliveryAddressInput = Pick<
  ClientAddress,
  | "line"
  | "reference"
  | "countryCode"
  | "departmentCode"
  | "provinceCode"
  | "districtCode"
  | "recipientName"
  | "recipientPhone"
  | "receivingInstructions"
  | "receivingHours"
> &
  Partial<
    Pick<
      ClientAddress,
      | "addressType"
      | "roadType"
      | "streetName"
      | "streetNumber"
      | "interior"
      | "postalCode"
      | "latitude"
      | "longitude"
      | "placeId"
      | "source"
    >
  >;

@Injectable({ providedIn: "root" })
export class NexaPlatformClientAccountsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl;
  private readonly path = `${this.base}/client-accounts`;

  list(search = "", page = 0): Observable<ClientAccountPage> {
    return this.http.get<ClientAccountPage>(this.path, {
      params: new HttpParams()
        .set("search", search)
        .set("page", page)
        .set("size", 25),
    });
  }
  detail(id: string): Observable<ClientAccountDetail> {
    return this.http.get<ClientAccountDetail>(
      `${this.path}/${encodeURIComponent(id)}`,
    );
  }
  create(value: CreateClientAccount): Observable<ClientAccountDetail> {
    return this.http.post<ClientAccountDetail>(this.path, value);
  }
  update(
    id: string,
    version: number,
    value: UpdateClientAccount,
  ): Observable<ClientAccountDetail> {
    return this.http.patch<ClientAccountDetail>(
      `${this.path}/${encodeURIComponent(id)}`,
      value,
      this.version(version),
    );
  }
  changeStatus(
    id: string,
    version: number,
    action: "activations" | "suspensions",
  ): Observable<ClientAccountDetail> {
    return this.http.post<ClientAccountDetail>(
      `${this.path}/${encodeURIComponent(id)}/${action}`,
      null,
      this.version(version),
    );
  }
  buyerCandidates(): Observable<BuyerMembershipCandidate[]> {
    return this.http.get<BuyerMembershipCandidate[]>(
      `${this.path}/buyer-membership-candidates`,
    );
  }
  associateBuyer(
    id: string,
    version: number,
    membershipId: string,
  ): Observable<ClientAccountDetail> {
    return this.http.put<ClientAccountDetail>(
      `${this.path}/${encodeURIComponent(id)}/buyer-membership`,
      { membershipId },
      this.version(version),
    );
  }
  addresses(id: string): Observable<ClientAddress[]> {
    return this.http.get<ClientAddress[]>(this.addressPath(id));
  }
  createAddress(
    id: string,
    label: string,
    address: DeliveryAddressInput,
    defaultAddress: boolean,
  ): Observable<ClientAddress> {
    return this.http.post<ClientAddress>(this.addressPath(id), {
      label,
      address,
      defaultAddress,
    });
  }
  updateAddress(
    id: string,
    addressId: string,
    version: number,
    label: string,
    address: DeliveryAddressInput,
  ): Observable<ClientAddress> {
    return this.http.patch<ClientAddress>(
      `${this.addressPath(id)}/${encodeURIComponent(addressId)}`,
      { label, address },
      this.version(version),
    );
  }
  setDefaultAddress(
    id: string,
    addressId: string,
    version: number,
  ): Observable<ClientAddress> {
    return this.http.put<ClientAddress>(
      `${this.addressPath(id)}/${encodeURIComponent(addressId)}/default`,
      null,
      this.version(version),
    );
  }
  deactivateAddress(
    id: string,
    addressId: string,
    version: number,
  ): Observable<ClientAddress> {
    return this.http.delete<ClientAddress>(
      `${this.addressPath(id)}/${encodeURIComponent(addressId)}`,
      this.version(version),
    );
  }
  private addressPath(id: string): string {
    return `${this.path}/${encodeURIComponent(id)}/addresses`;
  }
  private version(version: number): { headers: HttpHeaders } {
    return { headers: new HttpHeaders({ "If-Match": `"${version}"` }) };
  }
}
