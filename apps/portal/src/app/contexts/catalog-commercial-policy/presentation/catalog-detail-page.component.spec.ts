import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import type { BuyerCatalogItem, CatalogDetailState } from '../application/catalog.models';
import { CatalogStore } from '../application/catalog.store';
import { CatalogDetailPageComponent } from './catalog-detail-page.component';

describe('CatalogDetailPageComponent', () => {
  const item: BuyerCatalogItem = {
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
    currentOfferPrice: { amount: '238.50', currency: 'PEN' },
    sellableAvailability: 6.5,
    availabilityStatus: 'AVAILABLE',
    pricingAsOf: '2026-10-09T10:15:00Z',
    availabilityAsOf: '2026-10-09T10:14:00Z',
  };

  function createFixture(detail: CatalogDetailState) {
    const store = { detail: () => detail, loadDetail: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CatalogDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'CAT-1001' } } } },
        { provide: CatalogStore, useValue: store },
      ],
    });
    const fixture = TestBed.createComponent(CatalogDetailPageComponent);
    fixture.detectChanges();
    return { fixture, store };
  }

  it('renders Buyer price, availability, status, and server timestamps as received', () => {
    const { fixture, store } = createFixture({ kind: 'loaded', item, errorMessage: null });
    const content = fixture.nativeElement.textContent as string;

    expect(store.loadDetail).toHaveBeenCalledWith('CAT-1001');
    expect(content).toContain('PEN 238.50');
    expect(content).toContain('6.5 EA');
    expect(content).toContain('AVAILABLE');
    expect(content).toContain('ACTIVE');
    expect(content).toContain('2026-10-09T10:15:00Z');
    expect(content).toContain('2026-10-09T10:14:00Z');
  });

  it('labels missing commercial values unavailable', () => {
    const { fixture } = createFixture({
      kind: 'loaded',
      item: {
        ...item,
        currentOfferPrice: null,
        sellableAvailability: null,
        availabilityStatus: null,
        pricingAsOf: null,
        availabilityAsOf: null,
      },
      errorMessage: null,
    });
    const content = fixture.nativeElement.textContent as string;

    expect(content.match(/Unavailable/g)).toHaveLength(5);
  });
});
