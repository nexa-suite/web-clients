import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NexaBuyerCatalogFavoritesApi } from "@nexa/api";
import type {
  BuyerCatalogFavoritePageResponse,
  BuyerCatalogFavoriteResponse,
} from "@nexa/api";
import { of } from "rxjs";
import type {
  PortalSessionLease,
  PortalSessionState,
} from "../../tenant-access-governance/application/public-api";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerCatalogFavoritesStore } from "./buyer-catalog-favorites.store";

describe("BuyerCatalogFavoritesStore", () => {
  const lease: PortalSessionLease = {
    epoch: 1,
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-1",
      surface: "PORTAL",
    },
  };
  const sessionState = signal<PortalSessionState>({
    status: "authenticated",
    session: {
      user: { userId: "user-1" },
      tenant: { tenantId: "tenant-1" },
      workspace: { workspaceId: "workspace-1" },
      membership: { membershipId: "membership-1" },
      surface: "PORTAL",
    },
  });
  const currentLease = signal<PortalSessionLease | null>(lease);
  const api = { list: vi.fn(), add: vi.fn(), remove: vi.fn() };
  let store: BuyerCatalogFavoritesStore;

  const favorite = (
    suffix: number,
  ): BuyerCatalogFavoriteResponse => ({
    sellableSkuId: `00000000-0000-0000-0000-${String(suffix).padStart(12, "0")}`,
    favoritedAt: "2026-10-27T12:00:00Z",
    currentOffer: null,
  });

  const page = (
    items: readonly BuyerCatalogFavoriteResponse[],
    pageNumber: number,
    totalItems: number,
    totalPages: number,
  ): BuyerCatalogFavoritePageResponse => ({
    items,
    page: pageNumber,
    size: 100,
    totalItems,
    totalPages,
  });

  beforeEach(() => {
    api.list.mockReset();
    api.add.mockReset();
    api.remove.mockReset();
    sessionState.set({
      status: "authenticated",
      session: {
        user: { userId: "user-1" },
        tenant: { tenantId: "tenant-1" },
        workspace: { workspaceId: "workspace-1" },
        membership: { membershipId: "membership-1" },
        surface: "PORTAL",
      },
    });
    currentLease.set(lease);
    TestBed.configureTestingModule({
      providers: [
        BuyerCatalogFavoritesStore,
        { provide: NexaBuyerCatalogFavoritesApi, useValue: api },
        {
          provide: PortalSessionStore,
          useValue: {
            state: sessionState,
            captureSessionLease: () => currentLease(),
            isSessionLeaseCurrent: (candidate: PortalSessionLease) =>
              sessionState().status === "authenticated" &&
              currentLease()?.epoch === candidate.epoch,
            expireSessionIfCurrent: vi.fn(),
            invalidateContextIfCurrent: vi.fn(),
          },
        },
      ],
    });
    store = TestBed.inject(BuyerCatalogFavoritesStore);
  });

  it("loads every server page and preserves unavailable saved SKUs", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      favorite(index + 1),
    );
    const finalFavorite = favorite(101);
    api.list
      .mockReturnValueOnce(of(page(firstPage, 0, 101, 2)))
      .mockReturnValueOnce(of(page([finalFavorite], 1, 101, 2)));

    await store.load();

    expect(api.list.mock.calls).toEqual([
      [{ page: 0, size: 100 }],
      [{ page: 1, size: 100 }],
    ]);
    expect(store.state().status).toBe("ready");
    expect(store.state().items).toHaveLength(101);
    expect(store.state().items.at(-1)).toEqual(finalFavorite);
  });

  it("adds and removes only after the API confirms each change", async () => {
    const saved = favorite(1);
    api.list.mockReturnValueOnce(of(page([], 0, 0, 0)));
    api.add.mockReturnValueOnce(of(saved));
    api.remove.mockReturnValueOnce(of(undefined));
    await store.load();

    await store.add(saved.sellableSkuId);
    expect(store.isFavorite(saved.sellableSkuId)).toBe(true);
    expect(store.isPending(saved.sellableSkuId)).toBe(false);

    await store.remove(saved.sellableSkuId);
    expect(store.isFavorite(saved.sellableSkuId)).toBe(false);
    expect(api.add).toHaveBeenCalledWith(saved.sellableSkuId);
    expect(api.remove).toHaveBeenCalledWith(saved.sellableSkuId);
  });

  it("hides saved products when the Buyer session lease changes", async () => {
    const saved = favorite(1);
    api.list.mockReturnValueOnce(of(page([saved], 0, 1, 1)));
    await store.load();
    expect(store.isFavorite(saved.sellableSkuId)).toBe(true);

    currentLease.set({
      ...lease,
      epoch: 2,
      scope: { ...lease.scope, membershipId: "membership-2" },
    });

    expect(store.state().status).toBe("idle");
    expect(store.state().items).toEqual([]);
  });
});
