export type CatalogSortField =
  | "itemName"
  | "brandName"
  | "categoryName"
  | "unitPrice";

export type CatalogSortDirection = "asc" | "desc";

export type CatalogSortValue = `${CatalogSortField}:${CatalogSortDirection}`;

export interface CatalogSearch {
  readonly q: string;
  readonly brand: string;
  readonly category: string;
  readonly coldChain: "NONE" | "REFRIGERATED" | "FROZEN" | "";
  readonly sort?: CatalogSortField;
  readonly direction?: CatalogSortDirection;
  readonly page: number;
}

export type CatalogSearchFilters = Pick<
  CatalogSearch,
  "q" | "brand" | "category" | "coldChain"
> &
  Partial<Pick<CatalogSearch, "sort" | "direction">>;

export interface BuyerCatalogPrice {
  readonly amount: string;
  readonly currency: string;
}

export interface BuyerCatalogImage {
  readonly url: string;
  readonly fileName: string;
}

export interface BuyerCatalogPromotion {
  readonly id: string;
  readonly name: string;
  readonly discountType: string;
  readonly discountAmount: number;
}

export interface BuyerCatalogItem {
  readonly sellableSkuId?: string | null;
  readonly catalogItemId: string;
  readonly skuCode: string;
  readonly itemName: string;
  readonly brandName: string | null;
  readonly categoryName: string | null;
  readonly description?: string | null;
  readonly presentation: string | null;
  readonly productVariantCode?: string | null;
  readonly productVariantName?: string | null;
  readonly productFamilyName: string | null;
  readonly unitOfMeasure: string | null;
  readonly packagingType: string | null;
  readonly coldChainRequirement: string | null;
  readonly status: string | null;
  readonly image?: BuyerCatalogImage | null;
  readonly promotionLabel?: string | null;
  readonly appliedPromotions?: readonly BuyerCatalogPromotion[] | null;
  readonly currentOfferPrice: BuyerCatalogPrice | null;
  readonly sellableAvailability: number | null;
  readonly availabilityStatus: string | null;
  readonly pricingAsOf: string | null;
  readonly availabilityAsOf: string | null;
}

export interface BuyerCatalogPage {
  readonly items: readonly BuyerCatalogItem[];
  readonly page: number;
  readonly size: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface CatalogFilterOption {
  readonly id: string;
  readonly name: string;
}

export interface CatalogPageState {
  readonly kind: "idle" | "loading" | "results" | "empty" | "error";
  readonly page: BuyerCatalogPage | null;
  readonly errorMessage: string | null;
}

export interface CatalogDetailState {
  readonly kind: "idle" | "loading" | "loaded" | "not-found" | "error";
  readonly item: BuyerCatalogItem | null;
  readonly errorMessage: string | null;
}
