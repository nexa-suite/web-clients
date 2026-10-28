import { DOCUMENT } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  NexaButton,
  NexaStatusChip,
  NexaSurface,
  NexaTextField,
  startForegroundRefresh,
} from "nexa-ui";
import { catchError, filter, from, map, of, take } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import {
  canAccessPortalFeature,
  PORTAL_ACCESS_RULES,
} from "../../../core/portal-access-policy";
import { BuyerRequestSelectionStore } from "../../sales-commitment/application/public-api";
import {
  BuyerCatalogFavoritesStore,
  CatalogStore,
  type BuyerCatalogItem,
} from "../application/public-api";
import { catalogImageFraming } from "./catalog-image-framing";
import type {
  CatalogSortDirection,
  CatalogSortField,
  CatalogSortValue,
} from "../application/public-api";

interface CatalogSortOption {
  readonly value: CatalogSortValue;
  readonly label: string;
  readonly sort: CatalogSortField;
  readonly direction: CatalogSortDirection;
}

const CATALOG_SORT_OPTIONS = [
  {
    value: "itemName:asc",
    label: "Name: A to Z",
    sort: "itemName",
    direction: "asc",
  },
  {
    value: "itemName:desc",
    label: "Name: Z to A",
    sort: "itemName",
    direction: "desc",
  },
  {
    value: "brandName:asc",
    label: "Brand: A to Z",
    sort: "brandName",
    direction: "asc",
  },
  {
    value: "categoryName:asc",
    label: "Category: A to Z",
    sort: "categoryName",
    direction: "asc",
  },
  {
    value: "unitPrice:asc",
    label: "Unit price: low to high",
    sort: "unitPrice",
    direction: "asc",
  },
  {
    value: "unitPrice:desc",
    label: "Unit price: high to low",
    sort: "unitPrice",
    direction: "desc",
  },
] as const satisfies readonly CatalogSortOption[];

@Component({
  selector: "portal-catalog-page",
  standalone: true,
  imports: [NexaButton, NexaStatusChip, NexaSurface, NexaTextField, RouterLink],
  templateUrl: "./catalog-page.component.html",
  styleUrl: "./catalog-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPageComponent implements OnInit {
  protected readonly imageFraming = catalogImageFraming;
  protected readonly store = inject(CatalogStore);
  protected readonly favorites = inject(BuyerCatalogFavoritesStore);
  protected readonly requestSelection = inject(BuyerRequestSelectionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly sessions = inject(PortalSessionStore);
  protected readonly canReadFavorites = computed(() => {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      canAccessPortalFeature(
        current.session,
        PORTAL_ACCESS_RULES.catalogFavoritesRead,
      )
    );
  });
  protected readonly canManageFavorites = computed(() => {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      canAccessPortalFeature(
        current.session,
        PORTAL_ACCESS_RULES.catalogFavoritesWrite,
      )
    );
  });
  protected readonly q = signal("");
  protected readonly brand = signal("");
  protected readonly category = signal("");
  protected readonly coldChain = signal("");
  protected readonly sortOption = signal<CatalogSortValue>("itemName:asc");
  protected readonly sortOptions = CATALOG_SORT_OPTIONS;
  protected readonly coldChainOptions = [
    { value: "", label: "All requirements" },
    { value: "NONE", label: "None" },
    { value: "REFRIGERATED", label: "Refrigerated" },
    { value: "FROZEN", label: "Frozen" },
  ] as const;

  ngOnInit(): void {
    if (this.canReadFavorites()) void this.favorites.load();
    const search = this.store.search();
    this.brand.set(search.brand);
    this.category.set(search.category);
    this.coldChain.set(search.coldChain);
    this.sortOption.set(
      `${search.sort ?? "itemName"}:${search.direction ?? "asc"}`,
    );
    void this.store.loadFilterOptions();

    let initialized = false;
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const current = this.store.search();
        const query = params.get("q");
        const category = params.get("category");
        const nextQuery = query ?? (initialized ? "" : search.q);
        const nextCategory = category ?? (initialized ? "" : search.category);
        this.q.set(nextQuery);
        this.category.set(nextCategory);
        if (nextQuery !== current.q || nextCategory !== current.category) {
          void this.store.applySearch({
            q: nextQuery,
            brand: current.brand,
            category: nextCategory,
            coldChain: current.coldChain,
            sort: current.sort,
            direction: current.direction,
          });
        } else if (!initialized) {
          void this.store.load();
        }
        initialized = true;
      });
    this.startPolling();
  }

  protected async search(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.store.applySearch({
      q: this.q(),
      brand: this.brand(),
      category: this.category(),
      coldChain: this.coldChain() as "" | "NONE" | "REFRIGERATED" | "FROZEN",
      ...this.selectedSort(),
    });
  }

  protected async sortBy(value: string): Promise<void> {
    const option = CATALOG_SORT_OPTIONS.find((item) => item.value === value);
    if (!option) return;
    this.sortOption.set(option.value);
    await this.store.applySearch({
      q: this.q(),
      brand: this.brand(),
      category: this.category(),
      coldChain: this.coldChain() as "" | "NONE" | "REFRIGERATED" | "FROZEN",
      sort: option.sort,
      direction: option.direction,
    });
  }

  private selectedSort(): Pick<CatalogSortOption, "sort" | "direction"> {
    const option = CATALOG_SORT_OPTIONS.find(
      (item) => item.value === this.sortOption(),
    );
    return option ?? CATALOG_SORT_OPTIONS[0];
  }

  private startPolling(): void {
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    const stopWhen = toObservable(this.sessions.state, {
      injector: this.injector,
    }).pipe(
      filter(() => !this.sessions.isSessionLeaseCurrent(lease)),
      take(1),
    );
    startForegroundRefresh({
      document: this.document,
      destroyRef: this.destroyRef,
      stopWhen,
      refresh: () => {
        if (
          !this.sessions.isSessionLeaseCurrent(lease) ||
          this.store.page().kind === "loading"
        ) {
          return of(this.sessions.isSessionLeaseCurrent(lease));
        }
        return from(this.store.refresh()).pipe(
          map(() => this.sessions.isSessionLeaseCurrent(lease)),
          catchError(() => of(true)),
        );
      },
    });
  }

  protected async pageBy(offset: number): Promise<void> {
    await this.store.changePage(this.store.search().page + offset);
  }

  protected addToRequest(item: BuyerCatalogItem): void {
    const result = this.requestSelection.add(item);
    if (result === "line-limit") {
      this.selectionMessage.set(
        "A request can include up to 100 different products.",
      );
    } else if (result === "unavailable") {
      this.selectionMessage.set(
        "This product cannot be added to the current request.",
      );
    } else {
      this.selectionMessage.set("");
    }
  }

  protected toggleFavorite(sellableSkuId: string | null | undefined): void {
    if (
      !this.canManageFavorites() ||
      !sellableSkuId ||
      this.favorites.isPending(sellableSkuId)
    ) {
      return;
    }
    if (this.favorites.isFavorite(sellableSkuId)) {
      void this.favorites.remove(sellableSkuId);
    } else {
      void this.favorites.add(sellableSkuId);
    }
  }

  protected removeFromRequest(skuId: string | null | undefined): void {
    if (skuId) this.requestSelection.remove(skuId);
    this.selectionMessage.set("");
  }

  protected adjustRequestQuantity(
    skuId: string | null | undefined,
    delta: number,
  ): void {
    if (skuId) this.requestSelection.adjustQuantity(skuId, delta);
  }

  protected updateRequestQuantity(
    skuId: string | null | undefined,
    rawValue: string,
  ): void {
    if (!skuId || !rawValue.trim()) return;
    const quantity = Number(rawValue);
    if (Number.isFinite(quantity)) {
      this.requestSelection.setQuantity(skuId, quantity);
    }
  }

  protected clearRequestSelection(): void {
    this.requestSelection.clear();
    this.selectionMessage.set("");
  }

  protected readonly selectionMessage = signal("");

  protected clear(): void {
    this.q.set("");
    this.brand.set("");
    this.category.set("");
    this.coldChain.set("");
    void this.store.applySearch({
      q: "",
      brand: "",
      category: "",
      coldChain: "",
    });
  }
}
