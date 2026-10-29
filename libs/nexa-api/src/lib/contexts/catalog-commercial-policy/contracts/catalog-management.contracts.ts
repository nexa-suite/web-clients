export interface CatalogCommandPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface ManagedCategory {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly status: string;
  readonly version: number;
}

export interface ManagedBrand {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly version: number;
}

export interface CreateCategoryRequest {
  readonly parentId: string | null;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
}

export interface CreateBrandRequest {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
}

export interface ProductFamilySummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly countryOfOrigin: string | null;
  readonly manufacturerReference: string | null;
  readonly supplierReference: string | null;
  readonly storageFamily: string;
  readonly status: string;
  readonly skuCount: number;
  readonly version: number;
}

export interface CreateProductFamilyRequest {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: string;
  readonly brandId: string;
  readonly countryOfOrigin: string | null;
  readonly manufacturerReference: string | null;
  readonly supplierReference: string | null;
  readonly storageFamily: "AMBIENT" | "REFRIGERATED" | "FROZEN";
}

export interface ProductVariantSummary {
  readonly id: string;
  readonly familyId: string;
  readonly familyCode: string;
  readonly familyName: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly skuCount: number;
  readonly version: number;
}

export interface CreateProductVariantRequest {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
}

export interface SellableSkuSummary {
  readonly id: string;
  readonly familyId: string;
  readonly familyCode: string;
  readonly familyName: string;
  readonly categoryName: string;
  readonly brandName: string;
  readonly skuCode: string;
  readonly gtin: string | null;
  readonly presentation: string | null;
  readonly packagingType: string | null;
  readonly unitOfMeasure: string | null;
  readonly netWeight: number | null;
  readonly grossWeight: number | null;
  readonly packQuantity: number | null;
  readonly temperatureMin: number | null;
  readonly temperatureMax: number | null;
  readonly shelfLifeDays: number;
  readonly minimumRemainingShelfLifeDays: number;
  readonly lotTrackingRequired: boolean;
  readonly expiryTrackingRequired: boolean;
  readonly taxCategory: string;
  readonly status: string;
  readonly version: number;
  readonly currentPrice: { readonly amount: number; readonly currency: string } | null;
  readonly variantId: string | null;
  readonly variantCode: string | null;
  readonly variantName: string | null;
}

export interface CreateSellableSkuRequest {
  readonly skuCode: string;
  readonly gtin: string | null;
  readonly presentation: string | null;
  readonly packagingType: string | null;
  readonly unitOfMeasure: string | null;
  readonly netWeight: number | null;
  readonly grossWeight: number | null;
  readonly packQuantity: number | null;
  readonly temperatureMin: number | null;
  readonly temperatureMax: number | null;
  readonly shelfLifeDays: number;
  readonly minimumRemainingShelfLifeDays: number;
  readonly lotTrackingRequired: boolean;
  readonly expiryTrackingRequired: boolean;
  readonly taxCategory: string | null;
}

export interface SkuPrice {
  readonly id: string;
  readonly skuId: string;
  readonly amount: number;
  readonly currency: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly sourceCode: string | null;
  readonly sourceDescription: string | null;
  readonly version: number;
  readonly cancelled: boolean;
}

export interface CreateSkuPriceRequest {
  readonly amount: number;
  readonly currency: string;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly sourceCode: string | null;
  readonly sourceDescription: string | null;
}
