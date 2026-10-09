import { inject, Injectable } from '@angular/core';
import { NexaApiError, NexaBuyerCatalogApi } from '@nexa/api';
import type { BuyerCatalogItemSummaryResponse, BuyerCatalogPageResponse, CatalogMoneyResponse } from '@nexa/api';
import { firstValueFrom } from 'rxjs';
import type { BuyerCatalogItem, BuyerCatalogPage, BuyerCatalogPrice, CatalogSearch } from './catalog.models';

@Injectable({ providedIn: 'root' })
export class CatalogApiAdapter {
  private readonly api = inject(NexaBuyerCatalogApi);

  async list(search: CatalogSearch): Promise<BuyerCatalogPage> {
    const response: BuyerCatalogPageResponse = await firstValueFrom(this.api.listCatalog({
      page: search.page,
      size: 12,
      sort: 'itemName',
      direction: 'asc',
      q: search.q || undefined,
      brand: search.brand || undefined,
      category: search.category || undefined,
      coldChain: search.coldChain || undefined,
    }));
    if (!hasValidPageMetadata(response)) {
      throw new NexaApiError('unknown', null, null);
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
    const response = await firstValueFrom(this.api.getCatalogItem(catalogItemId));
    return mapCatalogItem(response);
  }
}

function hasValidPageMetadata(response: BuyerCatalogPageResponse): boolean {
  return Number.isSafeInteger(response.page) && response.page >= 0 &&
    Number.isSafeInteger(response.size) && response.size > 0 && response.size <= 100 &&
    Number.isSafeInteger(response.totalItems) && response.totalItems >= response.items.length &&
    Number.isSafeInteger(response.totalPages) && response.totalPages >= 0 &&
    response.items.length <= response.size;
}

function mapCatalogItem(dto: BuyerCatalogItemSummaryResponse): BuyerCatalogItem {
  if (!dto.catalogItemId || !dto.skuCode || !dto.itemName) {
    throw new NexaApiError('unknown', null, null);
  }
  return {
    catalogItemId: dto.catalogItemId,
    skuCode: dto.skuCode,
    itemName: dto.itemName,
    brandName: dto.brandName ?? null,
    categoryName: dto.categoryName ?? null,
    presentation: dto.presentation ?? null,
    productFamilyName: dto.productFamilyName ?? null,
    unitOfMeasure: dto.unitOfMeasure ?? null,
    packagingType: dto.packagingType ?? null,
    coldChainRequirement: formatColdChainRequirement(dto.coldChainRequirement),
    status: dto.status ?? null,
    currentOfferPrice: mapCurrentOfferPrice(dto.currentOfferPrice),
    sellableAvailability: typeof dto.sellableAvailability === 'number' ? dto.sellableAvailability : null,
    availabilityStatus: dto.availabilityStatus ?? null,
    pricingAsOf: dto.pricingAsOf ?? null,
    availabilityAsOf: dto.availabilityAsOf ?? null,
  };
}

function mapCurrentOfferPrice(value: CatalogMoneyResponse | null): BuyerCatalogPrice | null {
  if (!value || !value.amount || !value.currency) return null;
  return { amount: value.amount, currency: value.currency };
}

function formatColdChainRequirement(value: string | null | undefined): string | null {
  switch (value) {
    case 'NONE': return 'None';
    case 'REFRIGERATED': return 'Refrigerated';
    case 'FROZEN': return 'Frozen';
    default: return null;
  }
}
