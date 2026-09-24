import { TestBed } from '@angular/core/testing';
import { NexaApiError } from '@nexa/api';
import { CatalogApiAdapter } from './catalog-api.adapter';
import type { BuyerCatalogPage } from './catalog.models';
import { CatalogStore } from './catalog.store';

describe('CatalogStore', () => {
  let store: CatalogStore;
  const api = { list: vi.fn(), detail: vi.fn() };

  beforeEach(() => {
    api.list.mockReset();
    api.detail.mockReset();
    TestBed.configureTestingModule({
      providers: [CatalogStore, { provide: CatalogApiAdapter, useValue: api }],
    });
    store = TestBed.inject(CatalogStore);
  });

  it('tracks empty, results, and error states for buyer filters', async () => {
    api.list.mockResolvedValueOnce({ items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 } satisfies BuyerCatalogPage);
    await store.applySearch({ q: '', brand: '', category: '', coldChain: '' });
    expect(store.page().kind).toBe('empty');

    api.list.mockResolvedValueOnce({
      items: [{
        catalogItemId: 'CAT-1',
        skuCode: 'SKU-1',
        itemName: 'Sample item',
        brandName: null,
        categoryName: null,
        presentation: null,
        productFamilyName: null,
        unitOfMeasure: null,
        packagingType: null,
        coldChainRequirement: null,
      }],
      page: 0,
      size: 12,
      totalItems: 1,
      totalPages: 1,
    } satisfies BuyerCatalogPage);
    await store.applySearch({ q: 'ambient', brand: 'Northwind', category: 'Grocery', coldChain: 'NONE' });
    expect(store.page().kind).toBe('results');
    expect(store.search()).toMatchObject({ q: 'ambient', brand: 'Northwind', category: 'Grocery', coldChain: 'NONE', page: 0 });

    api.list.mockRejectedValueOnce(new NexaApiError('forbidden', 403, null));
    await store.changePage(1);
    expect(store.page().kind).toBe('error');
    expect(store.page().errorMessage).toContain('buyer relationship');
  });

  it('keeps detail not-found separate from request draft or order concepts', async () => {
    api.detail.mockRejectedValue(new NexaApiError('not-found', 404, null));

    await store.loadDetail('CAT-unknown');

    expect(store.detail().kind).toBe('not-found');
    expect(store.detail().errorMessage).toContain('current catalog');
  });
});
