export interface CreditConfigurationCustomerAccount {
  readonly id: string;
  readonly commercialName: string;
  readonly status: string;
}

export interface CreditConfigurationCustomerAccountPage {
  readonly items: readonly CreditConfigurationCustomerAccount[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface NotConfiguredCreditAccount {
  readonly clientAccountId: string;
  readonly currency: string;
  readonly status: "NOT_CONFIGURED";
  readonly creditLimit: null;
  readonly financedExposure: null;
  readonly outstandingReceivables: null;
  readonly reservedExposure: null;
  readonly used: null;
  readonly availableCredit: null;
  readonly version: null;
}

export interface ConfiguredCreditAccount {
  readonly clientAccountId: string;
  readonly currency: string;
  readonly status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  readonly creditLimit: number;
  readonly financedExposure: number;
  readonly outstandingReceivables: number;
  readonly reservedExposure: number;
  readonly used: number;
  readonly availableCredit: number;
  readonly version: number;
}

export type CreditAccountConfigurationResponse =
  | NotConfiguredCreditAccount
  | ConfiguredCreditAccount;

export interface ConfigureCreditAccountRequest {
  readonly currency: string;
  readonly creditLimit: number;
  readonly active: boolean;
}
