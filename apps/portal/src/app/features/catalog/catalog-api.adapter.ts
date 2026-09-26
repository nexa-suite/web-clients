import { inject, Injectable } from '@angular/core';
import { NexaApiError, NexaHttpClient } from '@nexa/api';
import type { BuyerCatalogItemResponse, BuyerCatalogPageResponse } from '@nexa/api';
import type { BuyerCatalogItem, BuyerCatalogPage, CatalogSearch } from './catalog.models';

export function mapCatalogItem(dto: BuyerCatalogItemResponse): BuyerCatalogItem {
  return {
    catalogItemId: dto.catalogItemId ?? '',
    skuCode: dto.skuCode ?? '',
    itemName: dto.itemName ?? '',
    brandName: dto.brandName ?? null,
    categoryName: dto.categoryName ?? null,
    presentation: dto.presentation ?? null,
    productFamilyName: dto.productFamilyName ?? null,
    unitOfMeasure: dto.unitOfMeasure ?? null,
    packagingType: dto.packagingType ?? null,
    coldChainRequirement: formatColdChainRequirement(dto.coldChainRequirement),
    currentOfferPrice: dto.currentOfferPrice ?? null,
    sellableAvailability: dto.sellableAvailability ?? null,
    pricingAsOf: dto.pricingAsOf ?? null,
    availabilityAsOf: dto.availabilityAsOf ?? null,
  };
}

function formatColdChainRequirement(value: string | null | undefined): string | null {
  switch (value) {
    case 'NONE': return 'None';
    case 'REFRIGERATED': return 'Refrigerated';
    case 'FROZEN': return 'Frozen';
    default: return null;
  }
}

@Injectable({ providedIn: 'root' })
export class CatalogApiAdapter {
  private readonly http = inject(NexaHttpClient);

  async list(search: CatalogSearch): Promise<BuyerCatalogPage> {
    const response = await this.http.get<BuyerCatalogPageResponse>('/catalog-items', {
      query: {
        page: search.page,
        size: 12,
        sort: 'itemName',
        direction: 'asc',
        q: search.q || undefined,
        brand: search.brand || undefined,
        category: search.category || undefined,
        coldChain: search.coldChain || undefined,
      },
    });
    const items = (response.items ?? []).map(mapCatalogItem)
      .filter((item) => item.catalogItemId && item.skuCode && item.itemName);
    return {
      items,
      page: response.page ?? search.page,
      size: response.size ?? 12,
      totalItems: response.totalItems ?? items.length,
      totalPages: response.totalPages ?? (items.length ? 1 : 0),
    };
  }

  async detail(catalogItemId: string): Promise<BuyerCatalogItem> {
    const response = await this.http.get<BuyerCatalogItemResponse>(`/catalog-items/${encodeURIComponent(catalogItemId)}`);
    const item = mapCatalogItem(response);
    if (!item.catalogItemId || !item.skuCode || !item.itemName) {
      throw new NexaApiError('unknown', null, null);
    }
    return item;
  }
}
