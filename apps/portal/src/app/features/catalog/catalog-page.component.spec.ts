import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CatalogPageState, CatalogSearch } from './catalog.models';
import { CatalogPageComponent } from './catalog-page.component';
import { CatalogStore } from './catalog.store';

describe('CatalogPageComponent', () => {
  it('renders labeled search controls and an explicit empty state', async () => {
    const pageState = signal<CatalogPageState>({
      kind: 'empty',
      page: { items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 },
      errorMessage: null,
    });
    const searchState = signal<CatalogSearch>({ q: 'saved-sku-filter', brand: 'Saved brand', category: '', coldChain: '', page: 0 });
    const store = {
      page: pageState.asReadonly(),
      search: searchState.asReadonly(),
      load: vi.fn(),
      applySearch: vi.fn().mockResolvedValue(undefined),
      changePage: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
      providers: [provideRouter([]), { provide: CatalogStore, useValue: store }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Browse catalog SKUs');
    expect(fixture.nativeElement.querySelector('form[aria-label="Search catalog"]')).not.toBeNull();
    expect((fixture.nativeElement.querySelector('nexa-text-field input[type="search"]') as HTMLInputElement).value).toBe('saved-sku-filter');
    expect(fixture.nativeElement.textContent).toContain('No SKUs match this search');
    expect(store.load).toHaveBeenCalledOnce();
  });
});
