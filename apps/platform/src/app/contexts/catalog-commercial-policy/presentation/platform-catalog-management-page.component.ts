import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  signal,
} from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { firstValueFrom } from "rxjs";
import {
  NexaApiError,
  NexaCommandRetryStore,
  NexaPlatformCatalogApi,
  NexaPlatformCatalogManagementApi,
  type CreateBrandRequest,
  type CreateCategoryRequest,
  type CreateProductFamilyRequest,
  type CreateProductVariantRequest,
  type CreateSellableSkuRequest,
  type CreateSkuPriceRequest,
  type ManagedBrand,
  type ManagedCategory,
  type ProductFamilySummary,
  type ProductVariantSummary,
  type SellableSkuSummary,
  type SkuPrice,
  type PlatformCatalogTaxonomy,
} from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "../../tenant-access-governance/application/public-api";
import { catalogCommandRetryIdentity } from "../application/catalog-command-retry";

type CatalogUnknownCreate =
  | { readonly resource: "family"; readonly code: string }
  | {
      readonly resource: "variant";
      readonly familyId: string;
      readonly code: string;
    }
  | {
      readonly resource: "sku";
      readonly familyId: string;
      readonly code: string;
    };

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

type TaxonomyEditor =
  | {
      readonly kind: "category";
      readonly value: ManagedCategory;
      readonly draft: Mutable<CreateCategoryRequest>;
    }
  | {
      readonly kind: "brand";
      readonly value: ManagedBrand;
      readonly draft: Mutable<CreateBrandRequest>;
    };

const emptyCategory = (): Mutable<CreateCategoryRequest> => ({
  parentId: null,
  slug: "",
  name: "",
  description: "",
});
const emptyBrand = (): Mutable<CreateBrandRequest> => ({
  slug: "",
  name: "",
  description: "",
});
const emptyFamily = (): Mutable<CreateProductFamilyRequest> => ({
  code: "",
  name: "",
  description: "",
  categoryId: "",
  brandId: "",
  countryOfOrigin: "",
  manufacturerReference: "",
  supplierReference: "",
  storageFamily: "AMBIENT",
});
const emptyVariant = (): Mutable<CreateProductVariantRequest> => ({
  code: "",
  name: "",
  description: "",
});
const emptySku = (): Mutable<CreateSellableSkuRequest> => ({
  skuCode: "",
  gtin: "",
  presentation: "",
  packagingType: "",
  unitOfMeasure: "",
  netWeight: null,
  grossWeight: null,
  packQuantity: 1,
  temperatureMin: null,
  temperatureMax: null,
  shelfLifeDays: 0,
  minimumRemainingShelfLifeDays: 0,
  lotTrackingRequired: false,
  expiryTrackingRequired: false,
  taxCategory: "STANDARD",
});
const emptyPrice = (): Mutable<CreateSkuPriceRequest> => ({
  amount: 0,
  currency: "PEN",
  validFrom: null,
  validUntil: null,
  sourceCode: "",
  sourceDescription: "",
});

@Component({
  selector: "platform-catalog-management-page",
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, NexaButton, NexaSurface, RouterLink],
  templateUrl: "./platform-catalog-management-page.component.html",
  styleUrl: "./platform-catalog-management-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformCatalogManagementPageComponent implements OnInit {
  private readonly api = inject(NexaPlatformCatalogManagementApi);
  private readonly catalogQueries = inject(NexaPlatformCatalogApi);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly retryStore = inject(NexaCommandRetryStore);
  private readonly destroyRef = inject(DestroyRef);
  private activeLease: PlatformSessionLease | null = null;

  protected readonly busy = signal(false);
  protected readonly error = signal("");
  protected readonly notice = signal("");
  protected readonly unknownCreate = signal<CatalogUnknownCreate | null>(null);
  protected readonly categoryLookups = signal<readonly PlatformCatalogTaxonomy[]>([]);
  protected readonly brandLookups = signal<readonly PlatformCatalogTaxonomy[]>([]);
  protected readonly categories = signal<readonly ManagedCategory[]>([]);
  protected readonly brands = signal<readonly ManagedBrand[]>([]);
  protected readonly families = signal<readonly ProductFamilySummary[]>([]);
  protected readonly variants = signal<readonly ProductVariantSummary[]>([]);
  protected readonly skus = signal<readonly SellableSkuSummary[]>([]);
  protected readonly prices = signal<readonly SkuPrice[]>([]);
  protected readonly selectedFamily = signal<ProductFamilySummary | null>(null);
  protected readonly selectedSku = signal<SellableSkuSummary | null>(null);
  protected readonly taxonomyEditor = signal<TaxonomyEditor | null>(null);

  protected categoryDraft: Mutable<CreateCategoryRequest> = emptyCategory();
  protected brandDraft: Mutable<CreateBrandRequest> = emptyBrand();
  protected familyDraft: Mutable<CreateProductFamilyRequest> = emptyFamily();
  protected variantDraft: Mutable<CreateProductVariantRequest> = emptyVariant();
  protected skuDraft: Mutable<CreateSellableSkuRequest> = emptySku();
  protected priceDraft: Mutable<CreateSkuPriceRequest> = emptyPrice();
  protected categoryLookupSearch = "";
  protected brandLookupSearch = "";
  protected familySearch = "";

  constructor() {
    effect(() => {
      const state = this.sessions.state();
      if (
        state.status !== "authenticated" ||
        (this.activeLease &&
          !this.sessions.isSessionLeaseCurrent(this.activeLease))
      ) {
        this.clearWorkspace();
      }
    });
  }

  ngOnInit(): void {
    void this.refresh();
  }

  protected get canManageTaxonomy(): boolean {
    return this.hasPermission("catalog.taxonomy.manage");
  }

  protected get canManageProducts(): boolean {
    return this.hasPermission("catalog.product.manage");
  }

  protected get canManagePrices(): boolean {
    return this.hasPermission("catalog.price.manage");
  }

  protected async refresh(): Promise<void> {
    await this.run(async (current) => {
      await Promise.all([
        this.refreshTaxonomyData(current),
        this.refreshFamilyList(current),
        this.refreshLookups(current),
      ]);
      if (current() && this.unknownCreate()) {
        await this.reconcileUnknownCreate(current);
      }
    });
  }

  protected async searchFamilies(): Promise<void> {
    await this.run((current) => this.refreshFamilyList(current));
  }

  protected async searchLookups(kind: "categories" | "brands"): Promise<void> {
    await this.run(async (current) => {
      await Promise.all([
        this.refreshLookups(current, kind),
        this.refreshTaxonomyData(current),
      ]);
    });
  }

  protected async createCategory(): Promise<void> {
    if (!this.canManageTaxonomy) return;
    const request = this.normalizeCategory(this.categoryDraft);
    await this.run(async (current, lease) => {
      const retry = await catalogCommandRetryIdentity(
        this.retryStore,
        this.sessions,
        lease,
        "create-category",
        "taxonomy",
        request,
      );
      if (!current()) return;
      if (!retry) {
        this.error.set("A scoped retry key is not available; no category was sent.");
        return;
      }
      const created = await firstValueFrom(
        this.api.createCategory(request, retry.key),
      );
      if (!current()) return;
      this.retryStore.remove(retry.storageKey);
      this.categoryDraft = emptyCategory();
      this.notice.set(`Category ${created.name} was created.`);
      await this.refreshTaxonomyData(current);
      if (!current()) return;
      await this.refreshLookups(current, "categories");
    });
  }

  protected async createBrand(): Promise<void> {
    if (!this.canManageTaxonomy) return;
    const request = this.normalizeBrand(this.brandDraft);
    await this.run(async (current, lease) => {
      const retry = await catalogCommandRetryIdentity(
        this.retryStore,
        this.sessions,
        lease,
        "create-brand",
        "taxonomy",
        request,
      );
      if (!current()) return;
      if (!retry) {
        this.error.set("A scoped retry key is not available; no brand was sent.");
        return;
      }
      const created = await firstValueFrom(this.api.createBrand(request, retry.key));
      if (!current()) return;
      this.retryStore.remove(retry.storageKey);
      this.brandDraft = emptyBrand();
      this.notice.set(`Brand ${created.name} was created.`);
      await this.refreshTaxonomyData(current);
      if (!current()) return;
      await this.refreshLookups(current, "brands");
    });
  }

  protected editCategory(value: ManagedCategory): void {
    this.taxonomyEditor.set({
      kind: "category",
      value,
      draft: {
        parentId: value.parentId,
        slug: value.slug,
        name: value.name,
        description: value.description,
      },
    });
  }

  protected editBrand(value: ManagedBrand): void {
    this.taxonomyEditor.set({
      kind: "brand",
      value,
      draft: {
        slug: value.slug,
        name: value.name,
        description: value.description,
      },
    });
  }

  protected cancelTaxonomyEdit(): void {
    this.taxonomyEditor.set(null);
  }

  protected async saveTaxonomyEdit(): Promise<void> {
    const editor = this.taxonomyEditor();
    if (!editor || !this.canManageTaxonomy) return;
    await this.run(async (current) => {
      if (editor.kind === "category") {
        await firstValueFrom(
          this.api.updateCategory(
            editor.value.id,
            editor.value.version,
            this.normalizeCategory(editor.draft),
          ),
        );
        if (!current()) return;
        this.notice.set(`Category ${editor.draft.name.trim()} was updated.`);
      } else {
        await firstValueFrom(
          this.api.updateBrand(
            editor.value.id,
            editor.value.version,
            this.normalizeBrand(editor.draft),
          ),
        );
        if (!current()) return;
        this.notice.set(`Brand ${editor.draft.name.trim()} was updated.`);
      }
      this.taxonomyEditor.set(null);
      await this.refreshTaxonomyData(current);
      if (!current()) return;
      await this.refreshLookups(current);
    });
  }

  protected async toggleCategory(value: ManagedCategory): Promise<void> {
    if (!this.canManageTaxonomy) return;
    const status = value.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await this.run(async (current) => {
      const updated = await firstValueFrom(
        this.api.changeCategoryStatus(value.id, value.version, status),
      );
      if (!current()) return;
      this.notice.set(`Category ${updated.name} is ${updated.status.toLowerCase()}.`);
      await this.refreshTaxonomyData(current);
      if (!current()) return;
      await this.refreshLookups(current, "categories");
    });
  }

  protected async toggleBrand(value: ManagedBrand): Promise<void> {
    if (!this.canManageTaxonomy) return;
    const status = value.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await this.run(async (current) => {
      const updated = await firstValueFrom(
        this.api.changeBrandStatus(value.id, value.version, status),
      );
      if (!current()) return;
      this.notice.set(`Brand ${updated.name} is ${updated.status.toLowerCase()}.`);
      await this.refreshTaxonomyData(current);
      if (!current()) return;
      await this.refreshLookups(current, "brands");
    });
  }

  protected async createFamily(): Promise<void> {
    if (
      !this.canManageProducts ||
      this.unknownCreate()?.resource === "family"
    )
      return;
    const request = this.normalizeFamily(this.familyDraft);
    await this.run(async (current) => {
      try {
        const created = await firstValueFrom(this.api.createFamily(request));
        if (!current()) return;
        this.familyDraft = emptyFamily();
        this.selectedFamily.set(created);
        this.selectedSku.set(null);
        this.notice.set(`Family ${created.code} was created as ${created.status}.`);
        await Promise.all([
          this.refreshFamilyList(current),
          this.loadFamilyChildren(created, current),
        ]);
      } catch (cause: unknown) {
        if (current() && this.isAmbiguous(cause)) {
          this.unknownCreate.set({ resource: "family", code: request.code });
          this.error.set(
            `The result for family ${request.code} is uncertain. Creation is blocked while the server list is checked.`,
          );
          await this.reconcileUnknownCreate(current);
          return;
        }
        throw cause;
      }
    });
  }

  protected async toggleFamily(value: ProductFamilySummary): Promise<void> {
    if (!this.canManageProducts) return;
    const status = value.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await this.run(async (current) => {
      const updated = await firstValueFrom(
        this.api.changeFamilyStatus(value.id, value.version, status),
      );
      if (!current()) return;
      this.upsertFamily(updated);
      this.notice.set(`Family ${updated.code} is ${updated.status.toLowerCase()}.`);
      if (this.selectedFamily()?.id === updated.id) {
        this.selectedFamily.set(updated);
      }
    });
  }

  protected async selectFamily(value: ProductFamilySummary): Promise<void> {
    this.selectedFamily.set(value);
    this.selectedSku.set(null);
    this.prices.set([]);
    await this.run((current) => this.loadFamilyChildren(value, current));
  }

  protected async createVariant(): Promise<void> {
    const family = this.selectedFamily();
    if (
      !family ||
      !this.canManageProducts ||
      this.unknownCreate()?.resource === "variant"
    )
      return;
    const request = this.normalizeVariant(this.variantDraft);
    await this.run(async (current, lease) => {
      const retry = await catalogCommandRetryIdentity(
        this.retryStore,
        this.sessions,
        lease,
        "create-variant",
        family.id,
        request,
      );
      if (!current()) return;
      if (!retry) {
        this.error.set("A scoped retry key is not available; no variant was sent.");
        return;
      }
      try {
        const created = await firstValueFrom(
          this.api.createVariant(family.id, request, retry.key),
        );
        if (!current()) return;
        this.retryStore.remove(retry.storageKey);
        this.variantDraft = emptyVariant();
        this.notice.set(`Variant ${created.code} was created for ${family.code}.`);
        await this.refreshFamilyChildren(current, "variants");
      } catch (cause: unknown) {
        if (current() && this.isAmbiguous(cause)) {
          this.unknownCreate.set({
            resource: "variant",
            familyId: family.id,
            code: request.code,
          });
          this.error.set(
            `The result for variant ${request.code} is uncertain. Creation is blocked while the server list is checked.`,
          );
          await this.reconcileUnknownCreate(current);
          return;
        }
        throw cause;
      }
    });
  }

  protected async createSku(): Promise<void> {
    const family = this.selectedFamily();
    if (
      !family ||
      !this.canManageProducts ||
      this.unknownCreate()?.resource === "sku"
    )
      return;
    const request = this.normalizeSku(this.skuDraft);
    await this.run(async (current) => {
      try {
        const created = await firstValueFrom(
          this.api.createSku(family.id, request),
        );
        if (!current()) return;
        this.skuDraft = emptySku();
        this.selectedSku.set(created);
        this.notice.set(`SKU ${created.skuCode} was created as ${created.status}.`);
        await Promise.all([
          this.refreshFamilyChildren(current, "skus"),
          this.refreshPrices(created.id, current),
        ]);
      } catch (cause: unknown) {
        if (current() && this.isAmbiguous(cause)) {
          this.unknownCreate.set({
            resource: "sku",
            familyId: family.id,
            code: request.skuCode,
          });
          this.error.set(
            `The result for SKU ${request.skuCode} is uncertain. Creation is blocked while the server list is checked.`,
          );
          await this.reconcileUnknownCreate(current);
          return;
        }
        throw cause;
      }
    });
  }

  protected async toggleSku(value: SellableSkuSummary): Promise<void> {
    if (!this.canManageProducts) return;
    const status = value.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await this.run(async (current) => {
      const updated = await firstValueFrom(
        this.api.changeSkuStatus(value.id, value.version, status),
      );
      if (!current()) return;
      this.skus.update((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (this.selectedSku()?.id === updated.id) this.selectedSku.set(updated);
      this.notice.set(`SKU ${updated.skuCode} is ${updated.status.toLowerCase()}.`);
    });
  }

  protected async selectSku(value: SellableSkuSummary): Promise<void> {
    this.selectedSku.set(value);
    await this.run((current) => this.refreshPrices(value.id, current));
  }

  protected async createPrice(): Promise<void> {
    const sku = this.selectedSku();
    if (!sku || !this.canManagePrices) return;
    const request = this.normalizePrice(this.priceDraft);
    await this.run(async (current, lease) => {
      const retry = await catalogCommandRetryIdentity(
        this.retryStore,
        this.sessions,
        lease,
        "create-price",
        sku.id,
        request,
      );
      if (!current()) return;
      if (!retry) {
        this.error.set("A scoped retry key is not available; no price was sent.");
        return;
      }
      const created = await firstValueFrom(
        this.api.createPrice(sku.id, request, retry.key),
      );
      if (!current()) return;
      this.retryStore.remove(retry.storageKey);
      this.priceDraft = emptyPrice();
      this.notice.set(`A ${created.currency} price was added to ${sku.skuCode}.`);
      await this.refreshPrices(sku.id, current);
    });
  }

  protected async checkUnknownCreate(): Promise<void> {
    await this.run((current) => this.reconcileUnknownCreate(current));
  }

  protected async retryUnknownVariant(): Promise<void> {
    const unknown = this.unknownCreate();
    if (
      !unknown ||
      unknown.resource !== "variant" ||
      this.variantDraft.code.trim() !== unknown.code ||
      !this.canManageProducts
    )
      return;
    const request = this.normalizeVariant(this.variantDraft);
    await this.run(async (current, lease) => {
      const retry = await catalogCommandRetryIdentity(
        this.retryStore,
        this.sessions,
        lease,
        "create-variant",
        unknown.familyId,
        request,
      );
      if (!current()) return;
      if (!retry) {
        this.error.set("A scoped retry key is not available; no variant was sent.");
        return;
      }
      try {
        const created = await firstValueFrom(
          this.api.createVariant(unknown.familyId, request, retry.key),
        );
        if (!current()) return;
        this.retryStore.remove(retry.storageKey);
        this.unknownCreate.set(null);
        this.variantDraft = emptyVariant();
        this.notice.set(`Variant ${created.code} is present for its family.`);
        await this.refreshFamilyChildren(current, "variants");
      } catch (cause: unknown) {
        if (current() && this.isAmbiguous(cause)) {
          this.error.set(
            `The variant result is still uncertain. Check the server list before retrying this same command.`,
          );
          await this.reconcileUnknownCreate(current);
          return;
        }
        throw cause;
      }
    });
  }

  protected closeNotice(): void {
    this.notice.set("");
  }

  private async run(
    action: (
      current: () => boolean,
      lease: PlatformSessionLease,
    ) => Promise<void>,
  ): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease || this.busy()) return;
    this.activeLease = lease;
    const current = () =>
      !this.destroyRef.destroyed && this.sessions.isSessionLeaseCurrent(lease);
    this.busy.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      await action(current, lease);
    } catch (cause: unknown) {
      if (current()) this.error.set(this.messageFor(cause));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  private async refreshTaxonomyData(current: () => boolean): Promise<void> {
    const [categories, brands] = await Promise.all([
      firstValueFrom(this.api.categories(this.categoryLookupSearch.trim())),
      firstValueFrom(this.api.brands(this.brandLookupSearch.trim())),
    ]);
    if (!current()) return;
    this.categories.set(categories.items);
    this.brands.set(brands.items);
  }

  private async refreshLookups(
    current: () => boolean,
    kind?: "categories" | "brands",
  ): Promise<void> {
    const categoriesPromise =
      !kind || kind === "categories"
        ? firstValueFrom(
            this.catalogQueries.taxonomy(
              "categories",
              this.categoryLookupSearch,
              0,
            ),
          )
        : null;
    const brandsPromise =
      !kind || kind === "brands"
        ? firstValueFrom(
            this.catalogQueries.taxonomy("brands", this.brandLookupSearch, 0),
          )
        : null;
    const [categories, brands] = await Promise.all([
      categoriesPromise,
      brandsPromise,
    ]);
    if (!current()) return;
    if (categories) this.categoryLookups.set(categories.items);
    if (brands) this.brandLookups.set(brands.items);
  }

  private async refreshFamilyList(current: () => boolean): Promise<void> {
    const page = await firstValueFrom(
      this.api.families(this.familySearch.trim(), 0),
    );
    if (!current()) return;
    this.families.set(page.items);
    const selected = this.selectedFamily();
    if (selected) {
      const refreshed = page.items.find((item) => item.id === selected.id);
      if (refreshed) this.selectedFamily.set(refreshed);
    }
  }

  private async loadFamilyChildren(
    family: ProductFamilySummary,
    current: () => boolean,
  ): Promise<void> {
    const [variants, skus] = await Promise.all([
      firstValueFrom(this.api.variants(family.id)),
      firstValueFrom(this.api.skus(family.id)),
    ]);
    if (!current()) return;
    this.variants.set(variants.items);
    this.skus.set(skus.items);
  }

  private async refreshFamilyChildren(
    current: () => boolean,
    only?: "variants" | "skus",
  ): Promise<void> {
    const family = this.selectedFamily();
    if (!family) return;
    const variantsPromise =
      !only || only === "variants"
        ? firstValueFrom(this.api.variants(family.id))
        : null;
    const skusPromise =
      !only || only === "skus"
        ? firstValueFrom(this.api.skus(family.id))
        : null;
    const [variants, skus] = await Promise.all([variantsPromise, skusPromise]);
    if (!current()) return;
    if (variants) this.variants.set(variants.items);
    if (skus) this.skus.set(skus.items);
  }

  private async refreshPrices(
    skuId: string,
    current: () => boolean,
  ): Promise<void> {
    const prices = await firstValueFrom(this.api.prices(skuId));
    if (!current()) return;
    if (this.selectedSku()?.id === skuId) this.prices.set(prices);
  }

  private async reconcileUnknownCreate(
    current: () => boolean,
  ): Promise<void> {
    const unknown = this.unknownCreate();
    if (!unknown) return;
    try {
      if (unknown.resource === "family") {
        const page = await firstValueFrom(this.api.families(unknown.code, 0));
        if (!current()) return;
        const match = page.items.find((item) => item.code === unknown.code);
        if (match) {
          this.unknownCreate.set(null);
          this.selectedFamily.set(match);
          this.selectedSku.set(null);
          this.familyDraft = emptyFamily();
          this.notice.set(
            `Family ${unknown.code} is present in the server list and selected for review.`,
          );
          this.error.set("");
          await this.loadFamilyChildren(match, current);
          return;
        }
      } else if (unknown.resource === "variant") {
        const page = await firstValueFrom(
          this.api.variants(unknown.familyId, unknown.code, 0),
        );
        if (!current()) return;
        const match = page.items.find((item) => item.code === unknown.code);
        if (match) {
          this.unknownCreate.set(null);
          this.variantDraft = emptyVariant();
          this.notice.set(
            `Variant ${unknown.code} is present in the server list for this family.`,
          );
          this.error.set("");
          this.variants.set(page.items);
          return;
        }
        if (current()) {
          this.error.set(
            `No matching variant appeared yet. Retry the unchanged command to reuse its idempotency key.`,
          );
        }
        return;
      } else {
        const page = await firstValueFrom(
          this.api.skus(unknown.familyId, unknown.code, 0),
        );
        if (!current()) return;
        const match = page.items.find((item) => item.skuCode === unknown.code);
        if (match) {
          this.unknownCreate.set(null);
          this.skuDraft = emptySku();
          this.selectedSku.set(match);
          this.notice.set(
            `SKU ${unknown.code} is present in the server list and selected for review.`,
          );
          this.error.set("");
          this.skus.set(page.items);
          await this.refreshPrices(match.id, current);
          return;
        }
      }
      if (current()) {
        this.error.set(
          `No matching ${unknown.resource} appeared in the server list. Creation stays blocked; check again before deciding what to do.`,
        );
      }
    } catch {
      if (current()) {
        this.error.set(
          `The ${unknown.resource} result is uncertain and its server list could not be read. Creation stays blocked.`,
        );
      }
    }
  }

  private normalizeCategory(value: CreateCategoryRequest): CreateCategoryRequest {
    return {
      parentId: value.parentId || null,
      slug: value.slug.trim(),
      name: value.name.trim(),
      description: this.nullable(value.description),
    };
  }

  private normalizeBrand(value: CreateBrandRequest): CreateBrandRequest {
    return {
      slug: value.slug.trim(),
      name: value.name.trim(),
      description: this.nullable(value.description),
    };
  }

  private normalizeFamily(value: CreateProductFamilyRequest): CreateProductFamilyRequest {
    return {
      ...value,
      code: value.code.trim(),
      name: value.name.trim(),
      description: this.nullable(value.description),
      countryOfOrigin: this.nullable(value.countryOfOrigin)?.toUpperCase() ?? null,
      manufacturerReference: this.nullable(value.manufacturerReference),
      supplierReference: this.nullable(value.supplierReference),
    };
  }

  private normalizeVariant(value: CreateProductVariantRequest): CreateProductVariantRequest {
    return {
      code: value.code.trim(),
      name: value.name.trim(),
      description: this.nullable(value.description),
    };
  }

  private normalizeSku(value: CreateSellableSkuRequest): CreateSellableSkuRequest {
    return {
      ...value,
      skuCode: value.skuCode.trim(),
      gtin: this.nullable(value.gtin),
      presentation: this.nullable(value.presentation),
      packagingType: this.nullable(value.packagingType),
      unitOfMeasure: this.nullable(value.unitOfMeasure),
      taxCategory: this.nullable(value.taxCategory)?.toUpperCase() ?? null,
    };
  }

  private normalizePrice(value: CreateSkuPriceRequest): CreateSkuPriceRequest {
    return {
      ...value,
      currency: value.currency.trim().toUpperCase(),
      validFrom: this.toInstant(value.validFrom),
      validUntil: this.toInstant(value.validUntil),
      sourceCode: this.nullable(value.sourceCode),
      sourceDescription: this.nullable(value.sourceDescription),
    };
  }

  private nullable(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private toInstant(value: string | null): string | null {
    if (!value) return null;
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? value : instant.toISOString();
  }

  private upsertFamily(value: ProductFamilySummary): void {
    this.families.update((items) =>
      items.map((item) => (item.id === value.id ? value : item)),
    );
  }

  private hasPermission(permission: string): boolean {
    const state = this.sessions.state();
    return (
      state.status === "authenticated" &&
      state.session.surface === "PLATFORM" &&
      state.session.membership?.permissions?.includes(permission) === true
    );
  }

  private isAmbiguous(cause: unknown): boolean {
    return (
      cause instanceof NexaApiError &&
      ["network", "timeout", "server", "unknown"].includes(cause.kind)
    );
  }

  private messageFor(cause: unknown): string {
    if (!(cause instanceof NexaApiError)) {
      return "Catalog command could not be completed. Refresh the records and try again.";
    }
    switch (cause.kind) {
      case "forbidden":
        return "The server denied this catalog command. Check your membership permission.";
      case "validation":
        return "The server rejected the values. Review the fields and try again.";
      case "conflict":
      case "precondition":
        return "The record changed on the server. Refresh it before trying again.";
      case "network":
      case "timeout":
      case "server":
        return "The server result may be incomplete. Refresh the records before repeating this command.";
      default:
        return "Catalog command could not be completed. Refresh the records and try again.";
    }
  }

  private clearWorkspace(): void {
    this.categories.set([]);
    this.brands.set([]);
    this.categoryLookups.set([]);
    this.brandLookups.set([]);
    this.families.set([]);
    this.variants.set([]);
    this.skus.set([]);
    this.prices.set([]);
    this.selectedFamily.set(null);
    this.selectedSku.set(null);
    this.taxonomyEditor.set(null);
    this.unknownCreate.set(null);
    this.error.set("");
    this.notice.set("");
    this.busy.set(false);
    this.activeLease = null;
  }
}
