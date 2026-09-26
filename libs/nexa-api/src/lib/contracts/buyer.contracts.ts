export const NEXA_BUYER_API_PATHS = {
  purchaseRequestDrafts: '/buyer/purchase-request-drafts',
} as const;

/** API v0.18 MoneyResponse payload. The runtime also emits decimal strings. */
export interface BuyerMoneyResponse {
  readonly amount?: number | string;
  readonly currency?: string;
}

export interface BuyerAppliedPromotionResponse {
  readonly id?: string;
  readonly name?: string;
  readonly discountType?: string;
  readonly discountAmount?: number;
}

export interface BuyerCatalogItemResponse {
  readonly catalogItemId?: string;
  readonly itemName?: string;
  readonly brandName?: string | null;
  readonly categoryName?: string | null;
  readonly presentation?: string | null;
  readonly productFamilyName?: string | null;
  readonly skuCode?: string;
  readonly unitOfMeasure?: string | null;
  readonly packagingType?: string | null;
  readonly coldChainRequirement?: string | null;
  readonly basePrice?: BuyerMoneyResponse | null;
  readonly effectivePrice?: BuyerMoneyResponse | null;
  readonly discountAmount?: BuyerMoneyResponse | null;
  readonly currency?: string | null;
  readonly appliedPromotions?: readonly BuyerAppliedPromotionResponse[] | null;
  readonly promotionLabel?: string | null;
  readonly currentOfferPrice?: BuyerMoneyResponse | null;
  readonly sellableAvailability?: number | null;
  readonly availabilityStatus?: string | null;
  readonly nearExpiry?: boolean | null;
  readonly availabilityAsOf?: string | null;
  readonly pricingAsOf?: string | null;
}

export interface BuyerCatalogPageResponse {
  readonly items?: readonly BuyerCatalogItemResponse[];
  readonly page?: number;
  readonly size?: number;
  readonly totalItems?: number;
  readonly totalPages?: number;
}

export interface BuyerPurchaseRequestDraftSummary {
  readonly id?: string;
  readonly status?: string;
  readonly version?: number;
  readonly requestedDeliveryDate?: string | null;
  readonly lineCount?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface BuyerPurchaseRequestDraftPage {
  readonly items?: readonly BuyerPurchaseRequestDraftSummary[];
  readonly page?: number;
  readonly size?: number;
  readonly totalItems?: number;
  readonly totalPages?: number;
}

export interface BuyerPurchaseRequestDraftLine {
  readonly id?: string;
  readonly skuId?: string;
  readonly skuCode?: string;
  readonly presentation?: string;
  readonly quantity?: number;
  readonly unit?: string;
  readonly baseUnitPrice?: number;
  readonly effectiveUnitPrice?: number;
  readonly discountAmount?: number;
  readonly currency?: string;
  readonly notes?: string | null;
}

export interface BuyerPurchaseRequestDraftDestination {
  readonly addressId?: string;
  readonly snapshot?: string;
  readonly schemaVersion?: string;
}

export interface BuyerPurchaseRequestDraftRoute {
  readonly provider?: string;
  readonly estimated?: boolean;
  readonly snapshot?: string;
  readonly schemaVersion?: string;
  readonly calculatedAt?: string;
}

export interface BuyerPurchaseRequestDraftWarehouseSelection {
  readonly warehouseId?: string;
  readonly snapshot?: string;
  readonly schemaVersion?: string;
  readonly selectedAt?: string;
}

/** Runtime Buyer response shape for GET /buyer/purchase-request-drafts/{draftId}. */
export interface BuyerPurchaseRequestDraftView {
  readonly id?: string;
  readonly clientAccountId?: string;
  readonly buyerMembershipId?: string;
  readonly status?: string;
  readonly version?: number;
  readonly requestedDeliveryDate?: string | null;
  readonly paymentPreference?: string | null;
  readonly creditResult?: string | null;
  readonly routeProvider?: string | null;
  readonly lines?: readonly BuyerPurchaseRequestDraftLine[];
  readonly destination?: BuyerPurchaseRequestDraftDestination | null;
  readonly route?: BuyerPurchaseRequestDraftRoute | null;
  readonly warehouseSelection?: BuyerPurchaseRequestDraftWarehouseSelection | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly submittedAt?: string | null;
}
