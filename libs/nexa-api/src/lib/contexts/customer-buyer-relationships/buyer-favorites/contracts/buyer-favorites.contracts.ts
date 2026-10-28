export const NEXA_BUYER_CATALOG_FAVORITES_API_PATHS = {
  collection: "/buyer/favorites",
} as const;

/** Optional page bounds; the API defaults to page 0 with 25 saved preferences. */
export interface BuyerCatalogFavoritesQuery {
  readonly page?: number;
  readonly size?: number;
}

/** Buyer-safe offer as currently visible in the Catalog; absent when hidden or inactive. */
export interface CurrentBuyerCatalogOfferResponse {
  readonly catalogItemId: string;
  readonly productId: string;
  readonly itemName: string;
  readonly brandName: string | null;
  readonly categoryName: string | null;
  readonly description: string | null;
  readonly presentation: string | null;
  readonly imageUrl: string | null;
  readonly imageFileName: string | null;
  readonly status: string;
  readonly availabilityStatus: string;
  readonly sellableAvailability: number | null;
  readonly productFamilyId: string | null;
  readonly productFamilyCode: string | null;
  readonly productFamilyName: string | null;
  readonly sellableSkuId: string;
  readonly skuCode: string | null;
  readonly unitOfMeasure: string | null;
  readonly packagingType: string | null;
  readonly productVariantCode: string | null;
  readonly productVariantName: string | null;
  readonly currentPrice: { readonly amount: string; readonly currency: string } | null;
  readonly pricingAsOf: string | null;
  readonly availabilityAsOf: string | null;
}

/** Stored Buyer preference plus its current, server-resolved offer if visible. */
export interface BuyerCatalogFavoriteResponse {
  readonly sellableSkuId: string;
  readonly favoritedAt: string;
  readonly currentOffer: CurrentBuyerCatalogOfferResponse | null;
}

export interface BuyerCatalogFavoritePageResponse {
  readonly items: readonly BuyerCatalogFavoriteResponse[];
  readonly page: number;
  readonly size: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
