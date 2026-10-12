import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type {
  ConfigureCreditAccountRequest,
  CreditAccountConfigurationResponse,
  CreditConfigurationCustomerAccountPage,
} from "../contracts/credit-account-configuration.contracts";

export const NEXA_CREDIT_ACCOUNT_CONFIGURATION_PATHS = {
  customerAccounts: "/credit-account-configurations/customer-accounts",
  clientAccountConfiguration: (clientAccountId: string) =>
    `/client-accounts/${encodeURIComponent(clientAccountId)}/credit-account`,
} as const;

@Injectable({ providedIn: "root" })
export class NexaCreditAccountConfigurationApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(NEXA_API_HTTP_CONFIGURATION);

  listCustomerAccounts(
    search: string,
    status: string,
    page: number,
    size: number,
  ) {
    return this.http.get<CreditConfigurationCustomerAccountPage>(
      `${this.config.apiBaseUrl}${NEXA_CREDIT_ACCOUNT_CONFIGURATION_PATHS.customerAccounts}`,
      { params: { search, status, page, size } },
    );
  }

  read(clientAccountId: string, currency: string) {
    return this.http.get<CreditAccountConfigurationResponse>(
      `${this.config.apiBaseUrl}${NEXA_CREDIT_ACCOUNT_CONFIGURATION_PATHS.clientAccountConfiguration(clientAccountId)}`,
      { params: { currency }, observe: "response" },
    );
  }

  configure(
    clientAccountId: string,
    request: ConfigureCreditAccountRequest,
    precondition: { readonly ifNoneMatch: "*" } | { readonly ifMatch: string },
    idempotencyKey: string,
  ) {
    const headers = {
      "Idempotency-Key": idempotencyKey,
      ...("ifNoneMatch" in precondition
        ? { "If-None-Match": precondition.ifNoneMatch }
        : { "If-Match": precondition.ifMatch }),
    };
    return this.http.put<CreditAccountConfigurationResponse>(
      `${this.config.apiBaseUrl}${NEXA_CREDIT_ACCOUNT_CONFIGURATION_PATHS.clientAccountConfiguration(clientAccountId)}`,
      request,
      { headers, observe: "response" },
    );
  }
}
