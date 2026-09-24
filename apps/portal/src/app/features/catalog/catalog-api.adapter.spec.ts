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
        effectivePrice: 19.99,
        availabilityStatus: 'AVAILABLE',
        availableQuantity: 999,
        nearExpiry: true,
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
    });
    expect(page.items[0]).not.toHaveProperty('effectivePrice');
    expect(page.items[0]).not.toHaveProperty('availableQuantity');
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
