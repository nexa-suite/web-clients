import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PortalBuyerEligibilityService } from "../../customer-buyer-relationships/application/public-api";
import { CatalogStore, type BuyerCatalogItem } from "../../catalog-commercial-policy/application/public-api";
import { BuyerPurchaseRequestDraftStore } from "../application/buyer-purchase-request-draft.store";
import type { PurchaseRequestDraftLineInput, SetPurchaseRequestDraftPreferencesRequest } from "@nexa/api";
import { PortalSessionStore, type PortalSessionLease } from "../../tenant-access-governance/application/public-api";
import { BUYER_WALLET_CAPABILITIES_PORT } from "../../payments/application/public-api";
import {
  canAccessPortalFeature,
  PORTAL_ACCESS_RULES,
} from "../../../core/portal-access-policy";

interface DraftLineForm {
  readonly skuId: string;
  readonly quantity: string;
  readonly unit: string;
  readonly notes: string;
}

const PAYMENT_PREFERENCES: readonly SetPurchaseRequestDraftPreferencesRequest["paymentPreference"][] = [
  "CREDIT_LINE",
  "BANK_TRANSFER",
  "CARD_STRIPE",
  "CASH",
  "CASH_ON_DELIVERY",
];
const WALLET_PREFERENCE: SetPurchaseRequestDraftPreferencesRequest["paymentPreference"] = "WALLET";

@Component({
  selector: "portal-buyer-purchase-request-draft-page",
  standalone: true,
  imports: [FormsModule, NexaButton, NexaSurface, RouterLink],
  templateUrl: "./buyer-purchase-request-draft-page.component.html",
  styleUrl: "./buyer-purchase-request-draft-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerPurchaseRequestDraftPageComponent implements OnInit {
  protected readonly store = inject(BuyerPurchaseRequestDraftStore);
  protected readonly workflow = this.store.state;
  private readonly sessions = inject(PortalSessionStore);
  private readonly walletCapabilities = inject(BUYER_WALLET_CAPABILITIES_PORT);
  private readonly formLease = signal<PortalSessionLease | null>(this.sessions.captureSessionLease());
  private initialized = false;
  private initializedLease: PortalSessionLease | null = null;
  protected readonly contextIsCurrent = computed(() => {
    const lease = this.formLease();
    return lease !== null && this.sessions.isSessionLeaseCurrent(lease);
  });
  protected readonly canWriteRequests = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" &&
      canAccessPortalFeature(current.session, PORTAL_ACCESS_RULES.purchaseRequestWrite);
  });
  protected readonly canReadRequests = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" &&
      canAccessPortalFeature(current.session, PORTAL_ACCESS_RULES.purchaseRequests);
  });
  protected readonly canReadCatalog = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" &&
      canAccessPortalFeature(current.session, PORTAL_ACCESS_RULES.catalog);
  });
  protected readonly catalog = inject(CatalogStore);
  protected readonly catalogSkuOptions = computed(() => {
    const pageItems = this.catalog.page().page?.items ?? [];
    const options = pageItems.filter((item) => Boolean(item.sellableSkuId));
    const selectedDetail = this.catalog.detail().item;
    if (selectedDetail?.sellableSkuId && !options.some((item) => item.sellableSkuId === selectedDetail.sellableSkuId)) {
      return [...options, selectedDetail];
    }
    return options;
  });
  protected catalogProductSearch = "";
  protected catalogBrandSearch = "";
  protected catalogCategorySearch = "";
  protected catalogColdChain = "";
  protected readonly catalogColdChainOptions = [
    { value: "", label: "All requirements" },
    { value: "NONE", label: "None" },
    { value: "REFRIGERATED", label: "Refrigerated" },
    { value: "FROZEN", label: "Frozen" },
  ] as const;
  private readonly selectedCatalogSkus = new Map<string, BuyerCatalogItem>();
  private readonly eligibility = inject(PortalBuyerEligibilityService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected requestedDeliveryDate = localDateString(new Date());
  protected paymentPreference: SetPurchaseRequestDraftPreferencesRequest["paymentPreference"] | "" = "";
  protected readonly canUseWallet = computed(() => {
    const current = this.sessions.state();
    if (current.status !== "authenticated" || current.session.surface !== "PORTAL") return false;
    const membership = current.session.membership;
    return membership?.roles?.includes("BUYER") === true
      && membership.permissions?.includes("payment.read") === true
      && membership.permissions?.includes("buyer.sales.write") === true
      && this.eligibility.currentAccount() !== null
      && this.contextIsCurrent()
      && this.walletCapabilities.canRead()
      && this.walletCapabilities.orderPaymentSupported();
  });
  protected readonly paymentPreferences = computed(() => this.canUseWallet()
    ? [...PAYMENT_PREFERENCES, WALLET_PREFERENCE]
    : PAYMENT_PREFERENCES);
  protected lines: DraftLineForm[] = [{ skuId: "", quantity: "1", unit: "", notes: "" }];
  protected localError = "";
  protected selectedAddressId = "";

  constructor() {
    effect(() => {
      const currentLease = this.sessions.captureSessionLease();
      const scopedLease = this.formLease();
      if (scopedLease && !this.sessions.isSessionLeaseCurrent(scopedLease)) {
        this.clearLocalForm();
        this.store.clear();
        this.walletCapabilities.clear();
        this.initializedLease = null;
        this.formLease.set(currentLease);
        if (currentLease && this.initialized) void this.initializeForLease(currentLease);
        return;
      }
      if (!this.canUseWallet() && this.paymentPreference === WALLET_PREFERENCE) {
        this.paymentPreference = "";
      }
      if (!scopedLease && currentLease) {
        this.formLease.set(currentLease);
        if (this.initialized) void this.initializeForLease(currentLease);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.initialized = true;
    const lease = this.formLease() ?? this.sessions.captureSessionLease();
    if (!lease) return;
    this.formLease.set(lease);
    await this.initializeForLease(lease);
  }

  private async initializeForLease(lease: PortalSessionLease): Promise<void> {
    if (this.initializedLease && sameLease(this.initializedLease, lease)) return;
    this.initializedLease = lease;
    this.store.clear();
    this.selectedCatalogSkus.clear();
    const catalogSearch = this.catalog.search();
    this.catalogProductSearch = catalogSearch.q;
    this.catalogBrandSearch = catalogSearch.brand;
    this.catalogCategorySearch = catalogSearch.category;
    this.catalogColdChain = catalogSearch.coldChain;
    if (this.canReadCatalog()) {
      await Promise.all([
        this.catalog.load(),
        this.catalog.loadFilterOptions(),
      ]);
      if (!this.sessions.isSessionLeaseCurrent(lease)) return;
    }
    const draftId = this.route.snapshot.queryParamMap.get("draftId");
    if (!draftId) {
      const skuId = this.route.snapshot.queryParamMap.get("skuId") ?? "";
      if (skuId) this.lines = [{ skuId, quantity: "1", unit: "", notes: "" }];
    }
    const account = this.eligibility.currentAccount();
    if (account) await this.store.loadAddresses(account.id);
    if (!this.sessions.isSessionLeaseCurrent(lease)) return;
    if (account && this.canRequestWalletCapability()) {
      await this.walletCapabilities.loadCapabilities();
    } else {
      this.walletCapabilities.clear();
    }
    if (!this.sessions.isSessionLeaseCurrent(lease)) return;
    if (draftId) {
      await this.store.loadDraft(draftId);
      if (!this.sessions.isSessionLeaseCurrent(lease)) return;
      const draft = this.workflow().draft;
      if (draft) {
        this.requestedDeliveryDate = draft.requestedDeliveryDate;
        this.paymentPreference = [...PAYMENT_PREFERENCES, WALLET_PREFERENCE].includes(draft.paymentPreference as SetPurchaseRequestDraftPreferencesRequest["paymentPreference"])
          ? draft.paymentPreference as SetPurchaseRequestDraftPreferencesRequest["paymentPreference"]
          : "";
        if (this.paymentPreference === WALLET_PREFERENCE && !this.canUseWallet()) {
          this.paymentPreference = "";
        }
        this.lines = draft.lines.map((line) => ({
          skuId: line.skuId,
          quantity: String(line.quantity),
          unit: line.unit ?? "",
          notes: line.notes ?? "",
        }));
        this.selectedAddressId = draft.destination?.addressId ?? "";
      }
    }
  }

  private clearLocalForm(): void {
    this.requestedDeliveryDate = localDateString(new Date());
    this.paymentPreference = "";
    this.lines = [{ skuId: "", quantity: "1", unit: "", notes: "" }];
    this.localError = "";
    this.selectedAddressId = "";
    this.catalogProductSearch = "";
    this.catalogBrandSearch = "";
    this.catalogCategorySearch = "";
    this.catalogColdChain = "";
    this.selectedCatalogSkus.clear();
  }

  protected updateLine(index: number, field: keyof DraftLineForm, value: string): void {
    if (field === "skuId" && value) {
      const selected = this.catalogSkuOptions().find((item) => item.sellableSkuId === value);
      if (selected) this.selectedCatalogSkus.set(value, selected);
    }
    this.lines = this.lines.map((line, row) => row === index ? { ...line, [field]: value } : line);
  }

  protected async searchCatalog(): Promise<void> {
    if (!this.canReadCatalog()) return;
    await this.catalog.applySearch({
      q: this.catalogProductSearch.trim(),
      brand: this.catalogBrandSearch.trim(),
      category: this.catalogCategorySearch.trim(),
      coldChain: this.catalogColdChain as "" | "NONE" | "REFRIGERATED" | "FROZEN",
    });
  }

  protected async clearCatalogFilters(): Promise<void> {
    this.catalogProductSearch = "";
    this.catalogBrandSearch = "";
    this.catalogCategorySearch = "";
    this.catalogColdChain = "";
    if (!this.canReadCatalog()) return;
    await this.catalog.applySearch({ q: "", brand: "", category: "", coldChain: "" });
  }

  protected async changeCatalogPage(offset: number): Promise<void> {
    const page = this.catalog.page().page;
    if (!page) return;
    const nextPage = page.page + offset;
    if (nextPage < 0 || nextPage >= page.totalPages) return;
    await this.catalog.changePage(nextPage);
  }

  protected addLine(): void {
    if (this.lines.length < 100) this.lines = [...this.lines, { skuId: "", quantity: "1", unit: "", notes: "" }];
  }

  protected removeLine(index: number): void {
    this.lines = this.lines.filter((_line, row) => row !== index);
  }

  protected async beginDraft(): Promise<void> {
    this.localError = "";
    const lines = this.validatedLines();
    const account = this.eligibility.currentAccount();
    if (!account) {
      this.localError = "A current Buyer account is required to start a request.";
      return;
    }
    if (!lines) return;
    const draft = await this.store.createDraft(account.id, this.requestedDeliveryDate);
    if (!draft) return;
    await this.store.replaceLines(lines);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { draftId: draft.id },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  protected async saveLines(): Promise<void> {
    const lines = this.validatedLines();
    if (lines) await this.store.replaceLines(lines);
  }

  protected async savePreferences(): Promise<void> {
    this.localError = "";
    const paymentPreference = this.paymentPreference;
    if (this.paymentPreference === WALLET_PREFERENCE && !this.canUseWallet()) {
      this.paymentPreference = "";
      this.localError = "Wallet payment is not currently supported for this Buyer context. Refresh the page before choosing it.";
      return;
    }
    if (!paymentPreference) {
      this.localError = "Choose a payment preference before saving.";
      return;
    }
    if (paymentPreference === WALLET_PREFERENCE) {
      const lease = this.formLease();
      const account = this.eligibility.currentAccount();
      if (
        !lease ||
        !account ||
        !this.canRequestWalletCapability() ||
        !this.sessions.isSessionLeaseCurrent(lease)
      ) {
        this.paymentPreference = "";
        this.localError = "Wallet payment support changed for this Buyer context. Refresh before saving this preference.";
        return;
      }
      await this.walletCapabilities.loadCapabilities();
      if (
        !this.sessions.isSessionLeaseCurrent(lease) ||
        this.eligibility.currentAccount()?.id !== account.id ||
        this.paymentPreference !== WALLET_PREFERENCE ||
        !this.canUseWallet()
      ) {
        if (this.paymentPreference === WALLET_PREFERENCE) {
          this.paymentPreference = "";
        }
        this.localError = "Wallet payment support changed for this Buyer context. Refresh before saving this preference.";
        return;
      }
    }
    await this.store.setPreferences({
      paymentPreference,
      requestedDeliveryDate: this.requestedDeliveryDate,
    });
  }

  protected choosePaymentPreference(value: string): void {
    if (value === WALLET_PREFERENCE && !this.canUseWallet()) {
      this.paymentPreference = "";
      this.localError = "Wallet payment is not currently supported for this Buyer context. Refresh the page before choosing it.";
      return;
    }
    if (value === "" || [...PAYMENT_PREFERENCES, WALLET_PREFERENCE].includes(value as SetPurchaseRequestDraftPreferencesRequest["paymentPreference"])) {
      this.paymentPreference = value as SetPurchaseRequestDraftPreferencesRequest["paymentPreference"] | "";
      this.localError = "";
    }
  }

  protected async chooseAddress(addressId: string): Promise<void> {
    this.selectedAddressId = addressId;
    if (addressId) await this.store.setDestination(addressId);
  }

  protected async refreshAddresses(): Promise<void> {
    const account = this.eligibility.currentAccount();
    if (account) await this.store.loadAddresses(account.id);
  }

  protected async submit(): Promise<void> {
    await this.store.submit();
    const draft = this.workflow().draft;
    if (this.canReadRequests() && this.workflow().status === "submitted" && draft) {
      await this.router.navigate(["/requests", draft.id]);
    }
  }

  protected async previewRoute(): Promise<void> {
    await this.store.previewRoute();
  }

  protected selectedAddressHasRouteCoordinates(): boolean {
    const address = this.workflow().addresses.find((candidate) => candidate.id === this.selectedAddressId);
    return typeof address?.latitude === "number"
      && Number.isFinite(address.latitude)
      && typeof address.longitude === "number"
      && Number.isFinite(address.longitude);
  }

  protected async refreshReview(): Promise<void> {
    await this.store.refreshReview();
  }

  protected skuLabel(skuId: string): string {
    const item = this.catalogSkuOptions().find((candidate) => candidate.sellableSkuId === skuId);
    if (item) return `${item.skuCode} · ${item.itemName}`;
    const previouslySelected = this.selectedCatalogSkus.get(skuId);
    if (previouslySelected) return `${previouslySelected.skuCode} · ${previouslySelected.itemName} · selected from catalog`;
    const savedLine = this.workflow().draft?.lines.find((line) => line.skuId === skuId);
    if (savedLine) return `${savedLine.skuCode}${savedLine.presentation ? ` · ${savedLine.presentation}` : ""} · saved draft selection`;
    return "This SKU is not on the current catalog page";
  }

  protected hasCatalogSku(skuId: string): boolean {
    return this.catalogSkuOptions().some((item) => item.sellableSkuId === skuId);
  }

  protected hasPreviouslySelectedCatalogSku(skuId: string): boolean {
    return this.selectedCatalogSkus.has(skuId);
  }

  protected isSavedDraftSku(skuId: string): boolean {
    return this.workflow().draft?.lines.some((line) => line.skuId === skuId) === true;
  }

  private validatedLines(): readonly PurchaseRequestDraftLineInput[] | null {
    this.localError = "";
    if (!this.lines.length) {
      this.localError = "Add at least one SKU to the request.";
      return null;
    }
    const normalized: PurchaseRequestDraftLineInput[] = [];
    for (const line of this.lines) {
      const quantity = Number(line.quantity);
      if (!line.skuId.trim() || !Number.isFinite(quantity) || quantity <= 0) {
        this.localError = "Choose a catalog SKU and enter a quantity greater than zero for each item.";
        return null;
      }
      const isCatalogSku = this.hasCatalogSku(line.skuId.trim())
        || this.hasPreviouslySelectedCatalogSku(line.skuId.trim());
      const isSavedDraftSku = this.workflow().draft?.lines.some((savedLine) => savedLine.skuId === line.skuId.trim()) === true;
      if (!isCatalogSku && !isSavedDraftSku) {
        this.localError = "Choose a sellable SKU from the catalog before starting this request.";
        return null;
      }
      normalized.push({
        skuId: line.skuId.trim(),
        quantity,
        unit: line.unit.trim() || null,
        notes: line.notes.trim() || null,
      });
    }
    return normalized;
  }

  private canRequestWalletCapability(): boolean {
    const current = this.sessions.state();
    if (current.status !== "authenticated" || current.session.surface !== "PORTAL") return false;
    const membership = current.session.membership;
    return membership?.roles?.includes("BUYER") === true
      && membership.permissions?.includes("payment.read") === true
      && membership.permissions?.includes("buyer.sales.write") === true;
  }
}

function sameLease(left: PortalSessionLease, right: PortalSessionLease): boolean {
  return left.epoch === right.epoch
    && left.scope.userId === right.scope.userId
    && left.scope.tenantId === right.scope.tenantId
    && left.scope.workspaceId === right.scope.workspaceId
    && left.scope.membershipId === right.scope.membershipId
    && left.scope.surface === right.scope.surface;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
