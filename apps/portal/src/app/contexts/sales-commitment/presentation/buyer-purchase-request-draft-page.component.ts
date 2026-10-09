import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PortalBuyerEligibilityService } from "../../customer-buyer-relationships/application/public-api";
import { CatalogStore } from "../../catalog-commercial-policy/application/public-api";
import { BuyerPurchaseRequestDraftStore } from "../application/buyer-purchase-request-draft.store";
import type { PurchaseRequestDraftLineInput, SetPurchaseRequestDraftPreferencesRequest } from "@nexa/api";
import { PortalSessionStore, type PortalSessionLease } from "../../tenant-access-governance/application/public-api";

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

@Component({
  selector: "portal-buyer-purchase-request-draft-page",
  standalone: true,
  imports: [NexaButton, NexaSurface, RouterLink],
  templateUrl: "./buyer-purchase-request-draft-page.component.html",
  styleUrl: "./buyer-purchase-request-draft-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerPurchaseRequestDraftPageComponent implements OnInit {
  protected readonly store = inject(BuyerPurchaseRequestDraftStore);
  protected readonly workflow = this.store.state;
  private readonly sessions = inject(PortalSessionStore);
  private readonly formLease = signal<PortalSessionLease | null>(this.sessions.captureSessionLease());
  private initialized = false;
  private initializedLease: PortalSessionLease | null = null;
  protected readonly contextIsCurrent = computed(() => {
    const lease = this.formLease();
    return lease !== null && this.sessions.isSessionLeaseCurrent(lease);
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
  private readonly eligibility = inject(PortalBuyerEligibilityService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected requestedDeliveryDate = localDateString(new Date());
  protected paymentPreference: SetPurchaseRequestDraftPreferencesRequest["paymentPreference"] | "" = "";
  protected readonly paymentPreferences = PAYMENT_PREFERENCES;
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
        this.initializedLease = null;
        this.formLease.set(currentLease);
        if (currentLease && this.initialized) void this.initializeForLease(currentLease);
        return;
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
    const account = this.eligibility.currentAccount();
    if (account) await this.store.loadAddresses(account.id);
    if (!this.sessions.isSessionLeaseCurrent(lease)) return;
    const draftId = this.route.snapshot.queryParamMap.get("draftId");
    if (draftId) {
      await this.store.loadDraft(draftId);
      if (!this.sessions.isSessionLeaseCurrent(lease)) return;
      const draft = this.workflow().draft;
      if (draft) {
        this.requestedDeliveryDate = draft.requestedDeliveryDate;
        this.paymentPreference = PAYMENT_PREFERENCES.includes(draft.paymentPreference as SetPurchaseRequestDraftPreferencesRequest["paymentPreference"])
          ? draft.paymentPreference as SetPurchaseRequestDraftPreferencesRequest["paymentPreference"]
          : "";
        this.lines = draft.lines.map((line) => ({
          skuId: line.skuId,
          quantity: String(line.quantity),
          unit: line.unit ?? "",
          notes: line.notes ?? "",
        }));
        this.selectedAddressId = draft.destination?.addressId ?? "";
      }
    } else {
      const skuId = this.route.snapshot.queryParamMap.get("skuId") ?? "";
      if (skuId) this.lines = [{ skuId, quantity: "1", unit: "", notes: "" }];
    }
  }

  private clearLocalForm(): void {
    this.requestedDeliveryDate = localDateString(new Date());
    this.paymentPreference = "";
    this.lines = [{ skuId: "", quantity: "1", unit: "", notes: "" }];
    this.localError = "";
    this.selectedAddressId = "";
  }

  protected updateLine(index: number, field: keyof DraftLineForm, value: string): void {
    this.lines = this.lines.map((line, row) => row === index ? { ...line, [field]: value } : line);
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
    if (!this.paymentPreference) {
      this.localError = "Choose a payment preference before saving.";
      return;
    }
    await this.store.setPreferences({
      paymentPreference: this.paymentPreference,
      requestedDeliveryDate: this.requestedDeliveryDate,
    });
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
    if (this.workflow().status === "submitted" && draft) {
      await this.router.navigate(["/requests", draft.id]);
    }
  }

  protected async previewRoute(): Promise<void> {
    await this.store.previewRoute();
  }

  protected async refreshReview(): Promise<void> {
    await this.store.refreshReview();
  }

  protected skuLabel(skuId: string): string {
    const item = this.catalogSkuOptions().find((candidate) => candidate.sellableSkuId === skuId);
    if (item) return `${item.skuCode} · ${item.itemName}`;
    const savedLine = this.workflow().draft?.lines.find((line) => line.skuId === skuId);
    if (savedLine) return `${savedLine.skuCode}${savedLine.presentation ? ` · ${savedLine.presentation}` : ""} · saved draft selection`;
    return "This SKU is not on the current catalog page";
  }

  protected hasCatalogSku(skuId: string): boolean {
    return this.catalogSkuOptions().some((item) => item.sellableSkuId === skuId);
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
      const isCatalogSku = this.hasCatalogSku(line.skuId.trim());
      const isSavedDraftSku = this.workflow().draft?.lines.some((savedLine) => savedLine.skuId === line.skuId.trim()) === true;
      if (!isCatalogSku && !isSavedDraftSku) {
        this.localError = "Choose a sellable SKU from the current catalog page before starting this request.";
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
