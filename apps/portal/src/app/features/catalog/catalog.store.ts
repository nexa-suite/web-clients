import { inject, Injectable, signal } from '@angular/core';
import { NexaApiError } from '@nexa/api';
import { CatalogApiAdapter } from './catalog-api.adapter';
import type { BuyerCatalogItem, CatalogPageState, CatalogSearch } from './catalog.models';

const emptySearch: CatalogSearch = {
  q: '',
  brand: '',
  category: '',
  coldChain: '',
  page: 0,
};

@Injectable({ providedIn: 'root' })
export class CatalogStore {
  private readonly api = inject(CatalogApiAdapter);
  private listRevision = 0;
  private detailRevision = 0;

  private readonly searchValue = signal<CatalogSearch>(emptySearch);
  private readonly pageValue = signal<CatalogPageState>({ kind: 'idle', page: null, errorMessage: null });
  private readonly detailValue = signal<{ kind: 'idle' | 'loading' | 'loaded' | 'not-found' | 'error'; item: BuyerCatalogItem | null; errorMessage: string | null }>({ kind: 'idle', item: null, errorMessage: null });

  readonly search = this.searchValue.asReadonly();
  readonly page = this.pageValue.asReadonly();
  readonly detail = this.detailValue.asReadonly();

  async load(): Promise<void> {
    await this.loadPage({ ...this.searchValue() });
  }

  async applySearch(filters: Omit<CatalogSearch, 'page'>): Promise<void> {
    await this.loadPage({ ...filters, page: 0 });
  }

  async changePage(page: number): Promise<void> {
    if (page < 0) return;
    await this.loadPage({ ...this.searchValue(), page });
  }

  async loadDetail(catalogItemId: string): Promise<void> {
    const revision = ++this.detailRevision;
    this.detailValue.set({ kind: 'loading', item: null, errorMessage: null });
    try {
      const item = await this.api.detail(catalogItemId);
      if (revision === this.detailRevision) this.detailValue.set({ kind: 'loaded', item, errorMessage: null });
    } catch (error) {
      if (revision !== this.detailRevision) return;
      const kind = error instanceof NexaApiError ? error.kind : 'unknown';
      this.detailValue.set({
        kind: kind === 'not-found' ? 'not-found' : 'error',
        item: null,
        errorMessage: catalogFailureMessage(kind),
      });
    }
  }

  private async loadPage(search: CatalogSearch): Promise<void> {
    const revision = ++this.listRevision;
    this.searchValue.set(search);
    this.pageValue.set({ kind: 'loading', page: null, errorMessage: null });
    try {
      const page = await this.api.list(search);
      if (revision !== this.listRevision) return;
      this.pageValue.set({ kind: page.items.length ? 'results' : 'empty', page, errorMessage: null });
    } catch (error) {
      if (revision !== this.listRevision) return;
      const kind = error instanceof NexaApiError ? error.kind : 'unknown';
      this.pageValue.set({ kind: 'error', page: null, errorMessage: catalogFailureMessage(kind) });
    }
  }
}

function catalogFailureMessage(kind: string): string {
  switch (kind) {
    case 'unauthenticated': return 'Your session has ended. Sign in to continue browsing.';
    case 'forbidden': return 'This catalog is not available for the current buyer relationship.';
    case 'network':
    case 'timeout': return 'The catalog could not be reached. Check your connection and try again.';
    case 'not-found': return 'This SKU is not available in the current catalog.';
    default: return 'The catalog could not be loaded. Try again.';
  }
}
