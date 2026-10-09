import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { NexaSalesCommitmentApi } from "@nexa/api";
import type { PurchaseRequestDetail } from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import { firstValueFrom } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";

type PurchaseRequestDetailState =
  | { readonly status: "loading"; readonly request: null; readonly message: null }
  | { readonly status: "ready"; readonly request: PurchaseRequestDetail; readonly message: null }
  | { readonly status: "error"; readonly request: null; readonly message: string };

type PortalLease = NonNullable<ReturnType<PortalSessionStore["captureSessionLease"]>>;
const LOADING_STATE: PurchaseRequestDetailState = { status: "loading", request: null, message: null };
const STALE_CONTEXT_STATE: PurchaseRequestDetailState = { status: "error", request: null, message: "Your Buyer context changed. Refresh after signing in to continue." };

@Component({
  selector: "portal-buyer-purchase-request-detail-page",
  standalone: true,
  imports: [NexaButton, NexaSurface, RouterLink],
  templateUrl: "./buyer-purchase-request-detail-page.component.html",
  styleUrl: "./buyer-sales-commitment-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerPurchaseRequestDetailPageComponent implements OnInit {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly sessions = inject(PortalSessionStore);
  private readonly route = inject(ActivatedRoute);
  private revision = 0;
  private readonly snapshot = signal<{ readonly state: PurchaseRequestDetailState; readonly lease: PortalLease | null }>({ state: LOADING_STATE, lease: null });
  protected readonly state = computed(() => {
    const current = this.snapshot();
    if (!current.lease) return current.state.status === "error" ? current.state : LOADING_STATE;
    return this.sessions.isSessionLeaseCurrent(current.lease) ? current.state : STALE_CONTEXT_STATE;
  });

  ngOnInit(): void { void this.load(); }
  protected async refresh(): Promise<void> { await this.load(); }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get("requestId");
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.revision;
    if (!id || !lease) {
      this.write({ status: "error", request: null, message: "This request is unavailable in the current Buyer context." }, null);
      return;
    }
    this.write(LOADING_STATE, lease);
    try {
      const response = await firstValueFrom(this.api.getPurchaseRequest(id));
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      if (!response.body) throw new Error("Empty purchase request response.");
      this.write({ status: "ready", request: response.body, message: null }, lease);
    } catch {
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      this.write({ status: "error", request: null, message: "This purchase request could not be loaded. Try again." }, lease);
    }
  }

  private write(state: PurchaseRequestDetailState, lease: PortalLease | null): void {
    this.snapshot.set({ state, lease });
  }
}
