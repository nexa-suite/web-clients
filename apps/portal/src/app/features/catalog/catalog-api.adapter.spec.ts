import { TestBed } from '@angular/core/testing';
import { NexaHttpClient } from '@nexa/api';
import { CatalogApiAdapter } from './catalog-api.adapter';

describe('CatalogApiAdapter', () => {
  let adapter: CatalogApiAdapter;
  const http = { get: vi.fn() };

  beforeEach(() => {
    http.get.mockReset();
    TestBed.configureTestingModule({
      providers: [CatalogApiAdapter, { provide: NexaHttpClient, useValue: http }],
    });
    adapter = TestBed.inject(CatalogApiAdapter);
  });

  it('uses Buyer catalog filters and maps only safe catalog projections', async () => {
    http.get.mockResolvedValue({
      page: 2,
      size: 12,
      totalItems: 13,
      totalPages: 2,
      items: [{
        catalogItemId: 'CAT-1001',
        skuCode: 'SKU-1001',
        itemName: 'Ambient item',
        brandName: 'Nexa brand',
        productFamilyName: 'Family',
        categoryName: 'Grocery',
        presentation: 'Box of 10',
        unitOfMeasure: 'EA',
        packagingType: 'BOX',
        coldChainRequirement: 'NONE',
        currentOfferPrice: { amount: '19.99', currency: 'PEN' },
        effectivePrice: { amount: '999.00', currency: 'PEN' },
        sellableAvailability: 4.5,
        pricingAsOf: '2026-09-26T02:00:00Z',
        availabilityAsOf: '2026-09-26T02:00:00Z',
      }],
    });

    const page = await adapter.list({
      q: 'ambient',
      brand: 'Nexa brand',
      category: 'Grocery',
      coldChain: 'NONE',
      page: 2,
    });

    expect(http.get).toHaveBeenCalledWith('/catalog-items', {
      query: {
        page: 2,
        size: 12,
        sort: 'itemName',
        direction: 'asc',
        q: 'ambient',
        brand: 'Nexa brand',
        category: 'Grocery',
        coldChain: 'NONE',
      },
    });
    expect(page.items[0]).toEqual({
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
      currentOfferPrice: { amount: '19.99', currency: 'PEN' },
      sellableAvailability: 4.5,
      pricingAsOf: '2026-09-26T02:00:00Z',
      availabilityAsOf: '2026-09-26T02:00:00Z',
    });
    expect(page.items[0].currentOfferPrice?.amount).not.toBe(999);
  });

  it('does not infer the current offer or sellable availability from other catalog fields', async () => {
    http.get.mockResolvedValue({
      catalogItemId: 'CAT-1002',
      skuCode: 'SKU-1002',
      itemName: 'Unpriced item',
      unitPrice: { amount: '10.00', currency: 'PEN' },
      effectivePrice: { amount: '9.00', currency: 'PEN' },
    });

    await expect(adapter.detail('CAT-1002')).resolves.toMatchObject({
      currentOfferPrice: null,
      sellableAvailability: null,
      pricingAsOf: null,
      availabilityAsOf: null,
    });
  });

  it('requests detail through the buyer-scoped catalog item operation', async () => {
    http.get.mockResolvedValue({ catalogItemId: 'CAT-1001', skuCode: 'SKU-1001', itemName: 'Ambient item' });

    await expect(adapter.detail('CAT-1001')).resolves.toMatchObject({
      catalogItemId: 'CAT-1001',
      skuCode: 'SKU-1001',
      itemName: 'Ambient item',
    });

    expect(http.get).toHaveBeenCalledWith('/catalog-items/CAT-1001');
  });
});
