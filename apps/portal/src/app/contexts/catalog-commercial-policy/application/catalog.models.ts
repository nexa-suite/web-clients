export interface CatalogSearch {
  readonly q: string;
  readonly brand: string;
  readonly category: string;
  readonly coldChain: 'NONE' | 'REFRIGERATED' | 'FROZEN' | '';
  readonly page: number;
}

export interface BuyerCatalogPrice {
  readonly amount: string;
  readonly currency: string;
}

export interface BuyerCatalogItem {
  readonly catalogItemId: string;
  readonly skuCode: string;
  readonly itemName: string;
  readonly brandName: string | null;
  readonly categoryName: string | null;
  readonly presentation: string | null;
  readonly productFamilyName: string | null;
  readonly unitOfMeasure: string | null;
  readonly packagingType: string | null;
  readonly coldChainRequirement: string | null;
  readonly status: string | null;
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

export interface CatalogPageState {
  readonly kind: 'idle' | 'loading' | 'results' | 'empty' | 'error';
  readonly page: BuyerCatalogPage | null;
  readonly errorMessage: string | null;
}

export interface CatalogDetailState {
  readonly kind: 'idle' | 'loading' | 'loaded' | 'not-found' | 'error';
  readonly item: BuyerCatalogItem | null;
  readonly errorMessage: string | null;
}
