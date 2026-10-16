import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DecimalPipe } from "@angular/common";
import { firstValueFrom } from "rxjs";
import {
  NexaApiError,
  NexaPlatformCatalogApi,
  type PlatformCatalogPage,
  type PlatformCatalogProduct,
  type PlatformCatalogTaxonomy,
  type PlatformCatalogTaxonomyPage,
} from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
@Component({
  selector: "platform-catalog-page",
  imports: [FormsModule, DecimalPipe, NexaButton, NexaSurface],
  templateUrl: "./platform-catalog-page.component.html",
  styleUrl: "./platform-catalog-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformCatalogPageComponent implements OnInit {
  private readonly api = inject(NexaPlatformCatalogApi);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private lease: ReturnType<PlatformSessionStore["captureSessionLease"]> = null;
  readonly page = signal<PlatformCatalogPage | null>(null);
  readonly taxonomy = signal<PlatformCatalogTaxonomyPage | null>(null);
  readonly brandOptions = signal<readonly PlatformCatalogTaxonomy[]>([]);
  readonly categoryOptions = signal<readonly PlatformCatalogTaxonomy[]>([]);
  readonly filterOptionsLoading = signal(false);
  readonly filterOptionsError = signal("");
  private filterOptionsLoaded = false;
  readonly selected = signal<PlatformCatalogProduct | null>(null);
  readonly busy = signal(false);
  readonly error = signal("");
  search = "";
  status = "";
  brand = "";
  category = "";
  kind: "products" | "categories" | "brands" = "products";
  constructor() {
    effect(() => {
      const state = this.sessions.state();
      if (
        state.status !== "authenticated" ||
        (this.lease && !this.sessions.isSessionLeaseCurrent(this.lease))
      ) {
        this.page.set(null);
        this.taxonomy.set(null);
        this.brandOptions.set([]);
        this.categoryOptions.set([]);
        this.filterOptionsLoading.set(false);
        this.filterOptionsError.set("");
        this.filterOptionsLoaded = false;
        this.selected.set(null);
        this.error.set("");
        this.busy.set(false);
      }
    });
  }
  ngOnInit(): void {
    void this.loadFilterOptions();
    void this.load();
  }
  async refresh(): Promise<void> {
    this.filterOptionsLoaded = false;
    await Promise.all([this.loadFilterOptions(), this.load()]);
  }
  async load(page = 0): Promise<void> {
    await this.run(async (current) => {
      if (this.kind === "products") {
        const result = await firstValueFrom(
          this.api.list(
            this.search,
            page,
            this.status,
            this.brand,
            this.category,
          ),
        );
        if (!current()) return;
        this.page.set(result);
        this.taxonomy.set(null);
      } else {
        const result = await firstValueFrom(
          this.api.taxonomy(this.kind, this.search.trim(), page),
        );
        if (!current()) return;
        this.taxonomy.set(result);
        this.page.set(null);
      }
      this.selected.set(null);
    });
  }
  async open(id: string): Promise<void> {
    await this.run(async (current) => {
      const product = await firstValueFrom(this.api.detail(id));
      if (current()) this.selected.set(product);
    });
  }
  async changeKind(): Promise<void> {
    this.search = "";
    this.status = "";
    this.brand = "";
    this.category = "";
    this.page.set(null);
    this.taxonomy.set(null);
    this.selected.set(null);
    await this.load();
  }
  private async run(
    action: (current: () => boolean) => Promise<void>,
  ): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease || this.busy()) return;
    this.lease = lease;
    const current = () =>
      !this.destroyRef.destroyed && this.sessions.isSessionLeaseCurrent(lease);
    this.busy.set(true);
    this.error.set("");
    try {
      await action(current);
    } catch (error: unknown) {
      if (current())
        this.error.set(
          error instanceof NexaApiError && error.kind === "forbidden"
            ? "Your membership cannot read this catalog."
            : "Catalog could not be loaded. Check the connection and refresh.",
        );
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  private async loadFilterOptions(): Promise<void> {
    if (this.filterOptionsLoaded || this.filterOptionsLoading()) return;
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    this.filterOptionsLoading.set(true);
    this.filterOptionsError.set("");
    const current = () => !this.destroyRef.destroyed && this.sessions.isSessionLeaseCurrent(lease);
    try {
      const [categories, brands] = await Promise.all([
        this.listAllTaxonomy("categories"),
        this.listAllTaxonomy("brands"),
      ]);
      if (!current()) return;
      this.categoryOptions.set(categories.filter((option) => option.status === "ACTIVE"));
      this.brandOptions.set(brands.filter((option) => option.status === "ACTIVE"));
      this.filterOptionsLoaded = true;
    } catch {
      if (current()) this.filterOptionsError.set("Brand and category options could not be loaded. Refresh catalog filters to try again.");
    } finally {
      if (current()) this.filterOptionsLoading.set(false);
    }
  }

  private async listAllTaxonomy(kind: "categories" | "brands"): Promise<PlatformCatalogTaxonomy[]> {
    const values: PlatformCatalogTaxonomy[] = [];
    let page = 0;
    let total = 0;
    do {
      const result = await firstValueFrom(this.api.taxonomy(kind, "", page));
      if (result.page !== page || result.size < 1 || result.total < result.items.length || result.items.length > result.size) {
        throw new NexaApiError("unknown", null, null);
      }
      if (page === 0) total = result.total;
      else if (result.total !== total) throw new NexaApiError("unknown", null, null);
      values.push(...result.items);
      if (values.length < total && result.items.length === 0) throw new NexaApiError("unknown", null, null);
      page += 1;
    } while (values.length < total);
    const unique = [...new Map(values.map((value) => [value.id, value])).values()];
    if (unique.length !== total) throw new NexaApiError("unknown", null, null);
    return unique;
  }
}
