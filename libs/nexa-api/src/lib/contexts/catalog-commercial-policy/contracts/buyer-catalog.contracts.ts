export interface CatalogMoneyResponse {
  readonly amount: string;
  readonly currency: string;
}

export interface CatalogMediaResponse {
  readonly url: string;
  readonly fileName: string;
}

export interface CatalogAppliedPromotionResponse {
  readonly id: string;
  readonly name: string;
  readonly discountType: string;
  readonly discountAmount: number;
}

export interface BuyerCatalogItemSummaryResponse {
  readonly catalogItemId: string;
  readonly productId: string;
  readonly itemName: string;
  readonly brandName: string | null;
  readonly categoryName: string | null;
  readonly presentation: string | null;
  readonly unitPrice?: CatalogMoneyResponse | null;
  readonly coldChainRequirement: string;
  readonly image: CatalogMediaResponse | null;
  readonly status: string;
  readonly availabilityStatus: string;
  readonly nearExpiry: boolean;
  readonly promotionLabel: string | null;
  readonly basePrice: CatalogMoneyResponse | null;
  readonly effectivePrice?: CatalogMoneyResponse | null;
  readonly discountAmount?: CatalogMoneyResponse | null;
  readonly currency?: string | null;
  readonly appliedPromotions?:
    | readonly CatalogAppliedPromotionResponse[]
    | null;
  readonly pricingAsOf?: string | null;
  readonly productFamilyId: string | null;
  readonly productFamilyCode: string | null;
  readonly productFamilyName: string | null;
  readonly sellableSkuId: string | null;
  readonly skuCode: string | null;
  readonly unitOfMeasure: string | null;
  readonly packagingType: string | null;
  readonly netWeight: number | null;
  readonly grossWeight: number | null;
  readonly availabilityAsOf: string | null;
  readonly productVariantCode: string | null;
  readonly productVariantName: string | null;
  readonly sellableAvailability: number | null;
  readonly currentOfferPrice: CatalogMoneyResponse | null;
}

export interface BuyerCatalogItemDetailResponse extends BuyerCatalogItemSummaryResponse {
  readonly description: string | null;
}

export interface BuyerCatalogPageResponse {
  readonly items: readonly BuyerCatalogItemSummaryResponse[];
  readonly page: number;
  readonly size: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly sort: { readonly field: string; readonly direction: string };
}

export interface BuyerCatalogQuery {
  readonly q?: string;
  readonly brand?: string;
  readonly category?: string;
  readonly coldChain?: "NONE" | "REFRIGERATED" | "FROZEN";
  readonly page?: number;
  readonly size?: number;
  readonly sort?: string;
  readonly direction?: "asc" | "desc";
}
