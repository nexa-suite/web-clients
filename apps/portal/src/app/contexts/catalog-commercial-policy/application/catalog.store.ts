import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { NexaApiError } from '@nexa/api';
import { PortalSessionStore, type PortalSessionLease } from '../../tenant-access-governance/application/public-api';
import { CatalogApiAdapter } from './catalog-api.adapter';
import type { CatalogDetailState, BuyerCatalogItem, CatalogPageState, CatalogSearch } from './catalog.models';

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
  private readonly session = inject(PortalSessionStore);
  private listRevision = 0;
  private detailRevision = 0;

  private readonly searchValue = signal<CatalogSearch>(emptySearch);
  private readonly pageValue = signal<CatalogPageState>({ kind: 'idle', page: null, errorMessage: null });
  private readonly detailValue = signal<CatalogDetailState>({ kind: 'idle', item: null, errorMessage: null });
  private readonly pageLeaseValue = signal<PortalSessionLease | null>(null);
  private readonly detailLeaseValue = signal<PortalSessionLease | null>(null);

  readonly search = this.searchValue.asReadonly();
  readonly page = computed(() => {
    const lease = this.pageLeaseValue();
    return lease && this.session.isSessionLeaseCurrent(lease)
      ? this.pageValue()
      : { kind: 'idle', page: null, errorMessage: null } satisfies CatalogPageState;
  });
  readonly detail = computed(() => {
    const lease = this.detailLeaseValue();
    return lease && this.session.isSessionLeaseCurrent(lease)
      ? this.detailValue()
      : { kind: 'idle', item: null, errorMessage: null } satisfies CatalogDetailState;
  });

  constructor() {
    effect(() => {
      this.session.state();
      const lease = this.session.captureSessionLease();
      if (!lease) {
        this.clearSessionData();
        return;
      }
      const pageLease = this.pageLeaseValue();
      if (pageLease && !this.session.isSessionLeaseCurrent(pageLease)) {
        this.clearPageData();
      }
      const detailLease = this.detailLeaseValue();
      if (detailLease && !this.session.isSessionLeaseCurrent(detailLease)) {
        this.clearDetailData();
      }
    });
  }

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
    const lease = this.session.captureSessionLease();
    if (!lease) {
      this.clearDetailData();
      return;
    }
    this.detailValue.set({ kind: 'loading', item: null, errorMessage: null });
    this.detailLeaseValue.set(lease);
    try {
      const item = await this.api.detail(catalogItemId);
      if (revision === this.detailRevision && this.session.isSessionLeaseCurrent(lease)) {
        this.detailValue.set({ kind: 'loaded', item, errorMessage: null });
      }
    } catch (error) {
      if (revision !== this.detailRevision || !this.session.isSessionLeaseCurrent(lease)) return;
      const kind = error instanceof NexaApiError ? error.kind : 'unknown';
      this.handleSessionError(error, lease);
      if (!this.session.isSessionLeaseCurrent(lease)) return;
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
    const lease = this.session.captureSessionLease();
    if (!lease) {
      this.clearPageData();
      return;
    }
    this.pageValue.set({ kind: 'loading', page: null, errorMessage: null });
    this.pageLeaseValue.set(lease);
    try {
      const page = await this.api.list(search);
      if (revision !== this.listRevision || !this.session.isSessionLeaseCurrent(lease)) return;
      this.pageValue.set({ kind: page.items.length ? 'results' : 'empty', page, errorMessage: null });
    } catch (error) {
      if (revision !== this.listRevision || !this.session.isSessionLeaseCurrent(lease)) return;
      const kind = error instanceof NexaApiError ? error.kind : 'unknown';
      this.handleSessionError(error, lease);
      if (!this.session.isSessionLeaseCurrent(lease)) return;
      this.pageValue.set({ kind: 'error', page: null, errorMessage: catalogFailureMessage(kind) });
    }
  }

  private handleSessionError(error: unknown, lease: PortalSessionLease): void {
    if (!(error instanceof NexaApiError)) return;
    if (error.kind === 'unauthenticated') {
      this.session.expireSessionIfCurrent(lease);
    } else if (error.kind === 'forbidden' && error.problem?.code === 'ACCESS_CONTEXT_INVALID') {
      this.session.invalidateContextIfCurrent(lease);
    }
  }

  private clearSessionData(): void {
    this.clearPageData();
    this.clearDetailData();
  }

  private clearPageData(): void {
    this.listRevision++;
    this.pageLeaseValue.set(null);
    this.pageValue.set({ kind: 'idle', page: null, errorMessage: null });
  }

  private clearDetailData(): void {
    this.detailRevision++;
    this.detailLeaseValue.set(null);
    this.detailValue.set({ kind: 'idle', item: null, errorMessage: null });
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
