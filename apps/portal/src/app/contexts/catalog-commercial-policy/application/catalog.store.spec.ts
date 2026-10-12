import { TestBed } from '@angular/core/testing';
import { NexaApiError } from '@nexa/api';
import { signal } from '@angular/core';
import type { PortalSessionLease, PortalSessionState } from '../../tenant-access-governance/application/public-api';
import { PortalSessionStore } from '../../tenant-access-governance/application/public-api';
import { CatalogApiAdapter } from './catalog-api.adapter';
import type { BuyerCatalogPage } from './catalog.models';
import { CatalogStore } from './catalog.store';

describe('CatalogStore', () => {
  let store: CatalogStore;
  const api = { list: vi.fn(), detail: vi.fn() };
  const initialLease: PortalSessionLease = {
    epoch: 1,
    scope: { userId: 'user-1', tenantId: 'tenant-1', workspaceId: 'workspace-1', membershipId: 'membership-1', surface: 'PORTAL' },
  };
  let sessionState: ReturnType<typeof signal<PortalSessionState>>;
  let currentLease: ReturnType<typeof signal<PortalSessionLease | null>>;
  let session: {
    state: ReturnType<typeof signal<PortalSessionState>>;
    captureSessionLease: () => PortalSessionLease | null;
    isSessionLeaseCurrent: (lease: PortalSessionLease) => boolean;
    expireSessionIfCurrent: ReturnType<typeof vi.fn>;
    invalidateContextIfCurrent: ReturnType<typeof vi.fn>;
  };

  const sessionResponse = (membershipId: string) => ({
    user: { userId: 'user-1' },
    tenant: { tenantId: 'tenant-1' },
    workspace: { workspaceId: 'workspace-1' },
    membership: { membershipId },
    surface: 'PORTAL',
  });

  beforeEach(() => {
    api.list.mockReset();
    api.detail.mockReset();
    sessionState = signal<PortalSessionState>({ status: 'authenticated', session: sessionResponse('membership-1') });
    currentLease = signal<PortalSessionLease | null>(initialLease);
    const isSessionLeaseCurrent = (lease: PortalSessionLease) => {
      const currentState = sessionState();
      return currentState.status === 'authenticated' && currentLease()?.epoch === lease.epoch;
    };
    session = {
      state: sessionState,
      captureSessionLease: () => sessionState().status === 'authenticated' ? currentLease() : null,
      isSessionLeaseCurrent,
      expireSessionIfCurrent: vi.fn((lease: PortalSessionLease) => {
        if (!isSessionLeaseCurrent(lease)) return false;
        currentLease.set(null);
        sessionState.set({ status: 'anonymous' });
        return true;
      }),
      invalidateContextIfCurrent: vi.fn((lease: PortalSessionLease) => {
        if (!isSessionLeaseCurrent(lease)) return false;
        currentLease.set(null);
        sessionState.set({ status: 'invalidated' });
        return true;
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        { provide: CatalogApiAdapter, useValue: api },
        { provide: PortalSessionStore, useValue: session },
      ],
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
        status: 'ACTIVE',
        currentOfferPrice: { amount: '17.00', currency: 'PEN' },
        sellableAvailability: 4,
        availabilityStatus: 'AVAILABLE',
        pricingAsOf: '2026-10-09T10:15:00Z',
        availabilityAsOf: '2026-10-09T10:14:00Z',
      }],
      page: 0,
      size: 12,
      totalItems: 1,
      totalPages: 1,
    } satisfies BuyerCatalogPage);
    await store.applySearch({ q: 'ambient', brand: 'Northwind', category: 'Grocery', coldChain: 'NONE' });
    expect(store.page().kind).toBe('results');
    expect(store.search()).toMatchObject({ q: 'ambient', brand: 'Northwind', category: 'Grocery', coldChain: 'NONE', page: 0 });
    expect(store.page().page?.items[0]).toMatchObject({
      currentOfferPrice: { amount: '17.00', currency: 'PEN' },
      sellableAvailability: 4,
      availabilityStatus: 'AVAILABLE',
      pricingAsOf: '2026-10-09T10:15:00Z',
      availabilityAsOf: '2026-10-09T10:14:00Z',
    });

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

  it('does not publish an in-flight query after a new Portal session becomes current', async () => {
    let finishOldQuery!: (page: BuyerCatalogPage) => void;
    api.list
      .mockImplementationOnce(() => new Promise<BuyerCatalogPage>((resolve) => { finishOldQuery = resolve; }))
      .mockResolvedValueOnce({
        items: [{
          catalogItemId: 'CAT-NEW',
          skuCode: 'SKU-NEW',
          itemName: 'New session item',
          brandName: null,
          categoryName: null,
          presentation: null,
          productFamilyName: null,
          unitOfMeasure: null,
          packagingType: null,
          coldChainRequirement: null,
          status: 'ACTIVE',
          currentOfferPrice: null,
          sellableAvailability: null,
          availabilityStatus: 'UNKNOWN',
          pricingAsOf: null,
          availabilityAsOf: null,
        }],
        page: 0,
        size: 12,
        totalItems: 1,
        totalPages: 1,
      } satisfies BuyerCatalogPage);

    const oldRequest = store.load();
    const nextLease: PortalSessionLease = {
      ...initialLease,
      epoch: 2,
      scope: { ...initialLease.scope, membershipId: 'membership-2' },
    };
    currentLease.set(nextLease);
    sessionState.set({ status: 'authenticated', session: sessionResponse('membership-2') });
    const newRequest = store.load();

    await newRequest;
    finishOldQuery({
      items: [{
        catalogItemId: 'CAT-OLD',
        skuCode: 'SKU-OLD',
        itemName: 'Old session item',
        brandName: null,
        categoryName: null,
        presentation: null,
        productFamilyName: null,
        unitOfMeasure: null,
        packagingType: null,
        coldChainRequirement: null,
        status: 'ACTIVE',
        currentOfferPrice: null,
        sellableAvailability: null,
        availabilityStatus: 'UNKNOWN',
        pricingAsOf: null,
        availabilityAsOf: null,
      }],
      page: 0,
      size: 12,
      totalItems: 1,
      totalPages: 1,
    });
    await oldRequest;

    expect(store.page().page?.items.map((item) => item.itemName)).toEqual(['New session item']);
  });

  it('hides ready catalog data immediately when the session is signed out', async () => {
    const item = {
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
      status: 'ACTIVE',
      currentOfferPrice: { amount: '17.00', currency: 'PEN' },
      sellableAvailability: 4,
      availabilityStatus: 'AVAILABLE',
      pricingAsOf: '2026-10-09T10:15:00Z',
      availabilityAsOf: '2026-10-09T10:14:00Z',
    };
    api.list.mockResolvedValue({ items: [item], page: 0, size: 12, totalItems: 1, totalPages: 1 });
    api.detail.mockResolvedValue(item);
    await store.load();
    await store.loadDetail('CAT-1');
    expect(store.page().kind).toBe('results');
    expect(store.detail().kind).toBe('loaded');

    sessionState.set({ status: 'anonymous' });

    expect(store.page()).toMatchObject({ kind: 'idle', page: null });
    expect(store.detail()).toMatchObject({ kind: 'idle', item: null });
  });

  it('does not let a late 401 from an older session expire a newer session', async () => {
    let rejectOldRequest!: (error: unknown) => void;
    api.list.mockImplementationOnce(() => new Promise<BuyerCatalogPage>((_resolve, reject) => { rejectOldRequest = reject; }));
    const oldRequest = store.load();
    const nextLease: PortalSessionLease = {
      ...initialLease,
      epoch: 2,
      scope: { ...initialLease.scope, membershipId: 'membership-2' },
    };
    currentLease.set(nextLease);
    sessionState.set({ status: 'authenticated', session: sessionResponse('membership-2') });
    session.expireSessionIfCurrent.mockClear();

    rejectOldRequest(new NexaApiError('unauthenticated', 401, null));
    await oldRequest;

    expect(session.expireSessionIfCurrent).not.toHaveBeenCalled();
    expect(sessionState().status).toBe('authenticated');
    expect(store.page().kind).toBe('idle');
  });

  it('expires only the captured session on 401 and does not log out for an ordinary 403', async () => {
    api.list.mockRejectedValueOnce(new NexaApiError('unauthenticated', 401, null));
    await store.load();
    expect(session.expireSessionIfCurrent).toHaveBeenCalledWith(initialLease);

    const replacementLease: PortalSessionLease = {
      ...initialLease,
      epoch: 2,
      scope: { ...initialLease.scope, membershipId: 'membership-2' },
    };
    currentLease.set(replacementLease);
    sessionState.set({ status: 'authenticated', session: sessionResponse('membership-2') });
    session.expireSessionIfCurrent.mockClear();
    session.invalidateContextIfCurrent.mockClear();
    api.list.mockRejectedValueOnce(new NexaApiError('forbidden', 403, { code: 'FORBIDDEN' }));

    await store.load();

    expect(store.page().kind).toBe('error');
    expect(session.expireSessionIfCurrent).not.toHaveBeenCalled();
    expect(session.invalidateContextIfCurrent).not.toHaveBeenCalled();
    expect(sessionState().status).toBe('authenticated');
  });

  it('invalidates only the captured session for ACCESS_CONTEXT_INVALID', async () => {
    api.list.mockRejectedValue(new NexaApiError('forbidden', 403, { code: 'ACCESS_CONTEXT_INVALID' }));

    await store.load();

    expect(session.invalidateContextIfCurrent).toHaveBeenCalledWith(initialLease);
    expect(session.expireSessionIfCurrent).not.toHaveBeenCalled();
    expect(store.page().kind).toBe('idle');
  });
});
