import { TestBed } from '@angular/core/testing';
import { NexaApiError, NexaBuyerCatalogApi } from '@nexa/api';
import type { BuyerCatalogItemSummaryResponse, BuyerCatalogPageResponse } from '@nexa/api';
import { of } from 'rxjs';
import { CatalogApiAdapter } from './catalog-api.adapter';

describe('CatalogApiAdapter', () => {
  let adapter: CatalogApiAdapter;
  const api = { listCatalog: vi.fn(), getCatalogItem: vi.fn() };

  const item: BuyerCatalogItemSummaryResponse = {
    catalogItemId: 'CAT-1001',
    productId: 'PRODUCT-1001',
    itemName: 'Ambient item',
    brandName: 'Nexa brand',
    categoryName: 'Grocery',
    presentation: 'Box of 10',
    unitPrice: { amount: '250.00', currency: 'PEN' },
    coldChainRequirement: 'NONE',
    image: null,
    status: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    nearExpiry: false,
    promotionLabel: null,
    basePrice: { amount: '999.00', currency: 'PEN' },
    effectivePrice: { amount: '250.00', currency: 'PEN' },
    discountAmount: null,
    currency: 'PEN',
    appliedPromotions: [],
    pricingAsOf: '2026-10-09T10:15:00Z',
    productFamilyId: 'FAMILY-1001',
    productFamilyCode: 'FAM-1001',
    productFamilyName: 'Family',
    sellableSkuId: 'SKU-ID-1001',
    skuCode: 'SKU-1001',
    unitOfMeasure: 'EA',
    packagingType: 'BOX',
    netWeight: 1,
    grossWeight: 1.2,
    availabilityAsOf: '2026-10-09T10:14:00Z',
    productVariantCode: 'VAR-1001',
    productVariantName: 'Ambient variant',
    sellableAvailability: 6.5,
    currentOfferPrice: { amount: '238.50', currency: 'PEN' },
  };

  beforeEach(() => {
    api.listCatalog.mockReset();
    api.getCatalogItem.mockReset();
    TestBed.configureTestingModule({
      providers: [CatalogApiAdapter, { provide: NexaBuyerCatalogApi, useValue: api }],
    });
    adapter = TestBed.inject(CatalogApiAdapter);
  });

  it('uses Buyer catalog filters and maps authoritative commercial fields from the typed response', async () => {
    const response: BuyerCatalogPageResponse = {
      items: [item],
      page: 2,
      size: 12,
      totalItems: 13,
      totalPages: 2,
      sort: { field: 'itemName', direction: 'asc' },
    };
    api.listCatalog.mockReturnValue(of(response));

    const page = await adapter.list({
      q: 'ambient',
      brand: 'Nexa brand',
      category: 'Grocery',
      coldChain: 'NONE',
      page: 2,
    });

    expect(api.listCatalog).toHaveBeenCalledWith({
      page: 2,
      size: 12,
      sort: 'itemName',
      direction: 'asc',
      q: 'ambient',
      brand: 'Nexa brand',
      category: 'Grocery',
      coldChain: 'NONE',
    });
    expect(api.listCatalog.mock.calls[0][0]).not.toHaveProperty('clientAccountId');
    expect(page).toMatchObject({ page: 2, size: 12, totalItems: 13, totalPages: 2 });
    expect(page.items[0]).toMatchObject({
      catalogItemId: 'CAT-1001',
      skuCode: 'SKU-1001',
      itemName: 'Ambient item',
      brandName: 'Nexa brand',
      categoryName: 'Grocery',
      presentation: 'Box of 10',
      productFamilyName: 'Family',
      unitOfMeasure: 'EA',
      packagingType: 'BOX',
      coldChainRequirement: 'None',
      status: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      currentOfferPrice: { amount: '238.50', currency: 'PEN' },
      sellableAvailability: 6.5,
      pricingAsOf: '2026-10-09T10:15:00Z',
      availabilityAsOf: '2026-10-09T10:14:00Z',
    });
    expect(page.items[0]).not.toHaveProperty('basePrice');
    expect(page.items[0]).not.toHaveProperty('effectivePrice');
  });

  it('keeps missing Buyer offer values unavailable instead of deriving them from other prices', async () => {
    api.getCatalogItem.mockReturnValue(of({ ...item, currentOfferPrice: null, sellableAvailability: null }));

    const detail = await adapter.detail('CAT-1001');

    expect(api.getCatalogItem).toHaveBeenCalledWith('CAT-1001');
    expect(detail.currentOfferPrice).toBeNull();
    expect(detail.sellableAvailability).toBeNull();
  });

  it('fails closed when the API returns invalid paging metadata', async () => {
    api.listCatalog.mockReturnValue(of({
      items: [item],
      page: -1,
      size: 0,
      totalItems: 1,
      totalPages: 1,
      sort: { field: 'itemName', direction: 'asc' },
    }));

    await expect(adapter.list({ q: '', brand: '', category: '', coldChain: '', page: 0 }))
      .rejects.toBeInstanceOf(NexaApiError);
  });

  it('uses the buyer-scoped catalog item operation for detail', async () => {
    api.getCatalogItem.mockReturnValue(of(item));

    await expect(adapter.detail('CAT-1001')).resolves.toMatchObject({
      catalogItemId: 'CAT-1001',
      skuCode: 'SKU-1001',
      itemName: 'Ambient item',
    });

    expect(api.getCatalogItem).toHaveBeenCalledWith('CAT-1001');
  });

  it('rejects a malformed catalog record instead of rendering an empty identifier', async () => {
    api.getCatalogItem.mockReturnValue(of({ ...item, skuCode: null }));

    await expect(adapter.detail('CAT-1001')).rejects.toBeInstanceOf(NexaApiError);
  });
});
