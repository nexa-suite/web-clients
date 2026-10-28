import { inject, Injectable } from "@angular/core";
import { NexaApiError, NexaBuyerCatalogApi } from "@nexa/api";
import type {
  BuyerCatalogItemSummaryResponse,
  BuyerCatalogPageResponse,
  CatalogMoneyResponse,
} from "@nexa/api";
import { firstValueFrom } from "rxjs";
import type {
  BuyerCatalogItem,
  BuyerCatalogImage,
  BuyerCatalogPage,
  BuyerCatalogPrice,
  BuyerCatalogPromotion,
  CatalogSearch,
  CatalogFilterOption,
} from "./catalog.models";

@Injectable({ providedIn: "root" })
export class CatalogApiAdapter {
  private readonly api = inject(NexaBuyerCatalogApi);

  async list(search: CatalogSearch): Promise<BuyerCatalogPage> {
    const response: BuyerCatalogPageResponse = await firstValueFrom(
      this.api.listCatalog({
        page: search.page,
        size: 12,
        sort: search.sort ?? "itemName",
        direction: search.direction ?? "asc",
        q: search.q || undefined,
        brand: search.brand || undefined,
        category: search.category || undefined,
        coldChain: search.coldChain || undefined,
      }),
    );
    if (!hasValidPageMetadata(response)) {
      throw new NexaApiError("unknown", null, null);
    }
    const items = response.items.map(mapCatalogItem);
    return {
      items,
      page: response.page,
      size: response.size,
      totalItems: response.totalItems,
      totalPages: response.totalPages,
    };
  }

  async detail(catalogItemId: string): Promise<BuyerCatalogItem> {
    const response = await firstValueFrom(
      this.api.getCatalogItem(catalogItemId),
    );
    return {
      ...mapCatalogItem(response),
      description: response.description?.trim() || null,
    };
  }

  async filterOptions(
    kind: "brand" | "category",
  ): Promise<readonly CatalogFilterOption[]> {
    const options: CatalogFilterOption[] = [];
    let total = 0;
    let page = 0;
    do {
      const response = await firstValueFrom(
        this.api.filterOptions(kind, "", page, 100),
      );
      if (
        !Number.isSafeInteger(response.page) ||
        response.page !== page ||
        !Number.isSafeInteger(response.size) ||
        response.size < 1 ||
        response.size > 100 ||
        !Number.isSafeInteger(response.total) ||
        response.total < response.items.length ||
        response.items.length > response.size
      ) {
        throw new NexaApiError("unknown", null, null);
      }
      if (page === 0) total = response.total;
      else if (response.total !== total)
        throw new NexaApiError("unknown", null, null);
      options.push(...response.items);
      if (options.length < total && response.items.length === 0) {
        throw new NexaApiError("unknown", null, null);
      }
      page += 1;
    } while (options.length < total);

    const unique = [
      ...new Map(options.map((option) => [option.id, option])).values(),
    ];
    if (unique.length !== total) throw new NexaApiError("unknown", null, null);
    return unique;
  }
}

function hasValidPageMetadata(response: BuyerCatalogPageResponse): boolean {
  return (
    Number.isSafeInteger(response.page) &&
    response.page >= 0 &&
    Number.isSafeInteger(response.size) &&
    response.size > 0 &&
    response.size <= 100 &&
    Number.isSafeInteger(response.totalItems) &&
    response.totalItems >= response.items.length &&
    Number.isSafeInteger(response.totalPages) &&
    response.totalPages >= 0 &&
    response.items.length <= response.size
  );
}

function mapCatalogItem(
  dto: BuyerCatalogItemSummaryResponse,
): BuyerCatalogItem {
  if (!dto.catalogItemId || !dto.skuCode || !dto.itemName) {
    throw new NexaApiError("unknown", null, null);
  }
  return {
    catalogItemId: dto.catalogItemId,
    sellableSkuId: dto.sellableSkuId ?? null,
    skuCode: dto.skuCode,
    itemName: dto.itemName,
    brandName: dto.brandName ?? null,
    categoryName: dto.categoryName ?? null,
    presentation: dto.presentation ?? null,
    productVariantCode: dto.productVariantCode?.trim() || null,
    productVariantName: dto.productVariantName?.trim() || null,
    productFamilyName: dto.productFamilyName ?? null,
    unitOfMeasure: dto.unitOfMeasure ?? null,
    packagingType: dto.packagingType ?? null,
    coldChainRequirement: formatColdChainRequirement(dto.coldChainRequirement),
    status: dto.status ?? null,
    image: mapCatalogImage(dto.image),
    promotionLabel: dto.promotionLabel ?? null,
    appliedPromotions: mapAppliedPromotions(dto.appliedPromotions),
    currentOfferPrice: mapCurrentOfferPrice(dto.currentOfferPrice),
    sellableAvailability:
      typeof dto.sellableAvailability === "number" &&
      Number.isFinite(dto.sellableAvailability)
        ? dto.sellableAvailability
        : null,
    availabilityStatus: dto.availabilityStatus ?? null,
    pricingAsOf: dto.pricingAsOf ?? null,
    availabilityAsOf: dto.availabilityAsOf ?? null,
  };
}

function mapCurrentOfferPrice(
  value: CatalogMoneyResponse | null | undefined,
): BuyerCatalogPrice | null {
  const amount = value?.amount?.trim();
  const currency = value?.currency?.trim();
  if (!amount || !currency) return null;
  return { amount, currency };
}

function mapCatalogImage(
  value: BuyerCatalogItemSummaryResponse["image"],
): BuyerCatalogImage | null {
  const fileName = value?.fileName?.trim();
  const url = value?.url?.trim();
  if (
    !fileName ||
    !url ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(fileName) ||
    fileName.includes("..") ||
    url !== `/catalog-items/${fileName}`
  ) {
    return null;
  }
  return { url, fileName };
}

function mapAppliedPromotions(
  values: BuyerCatalogItemSummaryResponse["appliedPromotions"],
): readonly BuyerCatalogPromotion[] | null {
  if (!values?.length) return null;
  return values.map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    discountType: promotion.discountType,
    discountAmount: promotion.discountAmount,
  }));
}

function formatColdChainRequirement(
  value: string | null | undefined,
): string | null {
  switch (value) {
    case "NONE":
      return "None";
    case "REFRIGERATED":
      return "Refrigerated";
    case "FROZEN":
      return "Frozen";
    default:
      return null;
  }
}
