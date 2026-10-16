export {
  NEXA_API_HTTP_CONFIGURATION,
  NEXA_REQUEST_POLICY,
  provideNexaHttp,
  type NexaRequestPolicy,
  type NexaApiHttpConfiguration,
} from "./lib/http/nexa-http";
export { NexaAuthenticationApi } from "./lib/contexts/tenant-access-governance/infrastructure/authentication-api";
export { NexaLogisticsApi } from "./lib/queries/operations/infrastructure/logistics-api";
export { NexaAccessTokenStore } from "./lib/http/access-token.store";
export {
  NexaApiError,
  mapNexaApiError,
  type NexaApiErrorKind,
  type SupportedProblemDetails,
} from "./lib/http/api-error";
export {
  NEXA_AUTH_API_PATHS,
  type AccessContextsResponse,
  type AccessContextResponse,
  type SelectAccessContextRequest,
  type AuthenticationResponse,
  type MembershipContext,
  type NexaSurface,
  type PasswordResetRequest,
  type PasswordResetResponse,
  type PasswordResetSubmission,
  type RefreshRequestHeaders,
  type SessionContext,
  type SessionRequestHeaders,
  type SessionResponse,
  type SessionUser,
  type SignOutRequestHeaders,
  type SignInRequest,
  type TenantContext,
  type WorkspaceContext,
  type WorkspacePreviewRequest,
  type WorkspacePreviewResponse,
} from "./lib/contexts/tenant-access-governance/contracts/authentication.contracts";
export {
  NEXA_LOGISTICS_API_PATHS,
  type LogisticsOperationsDashboardResponse,
} from "./lib/queries/operations/contracts/logistics.contracts";
export type {
  ApiProblemDetails,
  NexaProblemDetail,
  ProblemDetail,
} from "./lib/http/problem-details";
export { NexaBuyerRelationshipsApi } from "./lib/contexts/customer-buyer-relationships/infrastructure/buyer-relationships-api";
export { NexaPlatformClientAccountsApi } from "./lib/contexts/customer-buyer-relationships/infrastructure/platform-client-accounts-api";
export type {
  ClientAccountSummary,
  ClientAccountDetail,
  ClientAccountPage,
  CreateClientAccount,
  UpdateClientAccount,
  ClientAddress,
  DeliveryAddressInput,
  BuyerMembershipCandidate,
} from "./lib/contexts/customer-buyer-relationships/infrastructure/platform-client-accounts-api";
export { NexaPlatformCatalogApi } from "./lib/contexts/catalog-commercial-policy/infrastructure/platform-catalog-api";
export type {
  PlatformCatalogProduct,
  PlatformCatalogPage,
  PlatformCatalogTaxonomy,
  PlatformCatalogTaxonomyPage,
} from "./lib/contexts/catalog-commercial-policy/infrastructure/platform-catalog-api";
export { NexaWarehouseInventoryApi } from "./lib/contexts/inventory-availability/infrastructure/warehouse-inventory-api";
export {
  NEXA_WAREHOUSE_INVENTORY_API_PATHS,
  type ReceiveWarehouseStockRequest,
  type WarehouseInventoryLotResponse,
  type WarehouseInventoryPageResponse,
  type WarehouseInventoryResourceResponse,
  type WarehouseInventoryWarehouseResponse,
  type WarehouseInventoryZoneResponse,
} from "./lib/contexts/inventory-availability/contracts/warehouse-inventory.contracts";
export type { WarehouseInventoryLotQuery } from "./lib/contexts/inventory-availability/infrastructure/warehouse-inventory-api";
export { NexaPlatformCatalogManagementApi } from "./lib/contexts/catalog-commercial-policy/infrastructure/catalog-management-api";
export type {
  CatalogCommandPage,
  ManagedCategory,
  ManagedBrand,
  CreateCategoryRequest,
  CreateBrandRequest,
  ProductFamilySummary,
  CreateProductFamilyRequest,
  ProductVariantSummary,
  CreateProductVariantRequest,
  SellableSkuSummary,
  CreateSellableSkuRequest,
  SkuPrice,
  CreateSkuPriceRequest,
} from "./lib/contexts/catalog-commercial-policy/contracts/catalog-management.contracts";
export type {
  CurrentBuyerAccountResponse,
  BuyerAddressResponse,
} from "./lib/contexts/customer-buyer-relationships/contracts/buyer-account.contracts";
export { NexaBuyerCatalogApi } from "./lib/contexts/catalog-commercial-policy/infrastructure/buyer-catalog-api";
export type {
  BuyerCatalogQuery,
  BuyerCatalogPageResponse,
  BuyerCatalogItemSummaryResponse,
  BuyerCatalogItemDetailResponse,
  CatalogMoneyResponse,
} from "./lib/contexts/catalog-commercial-policy/contracts/buyer-catalog.contracts";

export { normalizeNexaApiBaseUrl } from "./lib/http/api-base-url";
export { NexaWalletRefundsApi } from "./lib/contexts/payments/infrastructure/wallet-refunds-api";
export type { WalletRefundRequest, WalletRefundResponse, WalletRefundCandidate, WalletRefundCandidatesPage } from "./lib/contexts/payments/contracts/wallet-refund.contracts";

export { NexaReceivablesApi } from "./lib/contexts/credit-receivables/infrastructure/receivables-api";
export type {
  BuyerCreditExposureResponse,
  ReceivableResponse,
  ReceivablesPageResponse,
} from "./lib/contexts/credit-receivables/contracts/receivables.contracts";
export { NexaCreditAccountConfigurationApi, NEXA_CREDIT_ACCOUNT_CONFIGURATION_PATHS } from "./lib/contexts/credit-receivables/infrastructure/credit-account-configuration-api";
export type {
  ConfigureCreditAccountRequest,
  ConfiguredCreditAccount,
  CreditAccountConfigurationResponse,
  CreditConfigurationCustomerAccount,
  CreditConfigurationCustomerAccountPage,
  NotConfiguredCreditAccount,
} from "./lib/contexts/credit-receivables/contracts/credit-account-configuration.contracts";
export { NexaPaymentHistoryApi } from "./lib/contexts/payments/infrastructure/payment-history-api";
export { NexaBuyerWalletApi } from "./lib/contexts/payments/infrastructure/buyer-wallet-api";
export { NexaPaymentCommandsApi } from "./lib/contexts/payments/infrastructure/payment-commands-api";
export type { BankTransferReportRequest, PaymentResponse } from "./lib/contexts/payments/contracts/payment-command.contracts";
export type {
  BuyerWalletActiveResponse,
  BuyerWalletMovementPageResponse,
  BuyerWalletMovementResponse,
  BuyerWalletNotInitializedResponse,
  BuyerWalletResponse,
  BuyerWalletCapabilitiesResponse,
  BuyerWalletRechargeCreatedResponse,
  BuyerWalletRechargeStatusResponse,
  BuyerWalletRechargeStatus,
} from "./lib/contexts/payments/contracts/buyer-wallet.contracts";
export type {
  PaymentHistoryResponse,
  PaymentHistoryPageResponse,
} from "./lib/contexts/payments/contracts/payment-history.contracts";

export * from "./lib/contexts/business-documents/public-api";
export * from "./lib/contexts/sales-commitment/public-api";
export * from "./lib/contexts/tenant-access-governance/public-api";

export * from "./lib/queries/fulfillment-readiness/public-api";
export * from "./lib/queries/reference-data/public-api";
export * from "./lib/contexts/fulfillment-delivery/public-api";
export { NexaCommandRetryStore } from "./lib/http/command-retry-store";
export { NexaBuyerDeliveriesApi } from "./lib/contexts/fulfillment-delivery/infrastructure/buyer-deliveries-api";
export type { BuyerDeliveryResponse, BuyerDeliveryPageResponse, BuyerDeliveryEventResponse, BuyerDeliveryLiveLocationResponse, BuyerDeliveryLocationSample } from "./lib/contexts/fulfillment-delivery/contracts/buyer-delivery.contracts";

export { NexaOrganizationRegistrationApi } from './lib/contexts/tenant-access-governance/infrastructure/organization-registration-api';
export type { OrganizationRegistrationDraft, RegistrationSnapshot } from './lib/contexts/tenant-access-governance/contracts/organization-registration.contracts';
