import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { NexaSalesCommitmentApi } from "@nexa/api";
import type { SalesOrder } from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import { firstValueFrom } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";

type SalesOrderDetailState =
  | { readonly status: "loading"; readonly order: null; readonly message: null }
  | { readonly status: "ready"; readonly order: SalesOrder; readonly message: null }
  | { readonly status: "error"; readonly order: null; readonly message: string };

type PortalLease = NonNullable<ReturnType<PortalSessionStore["captureSessionLease"]>>;
const LOADING_STATE: SalesOrderDetailState = { status: "loading", order: null, message: null };
const STALE_CONTEXT_STATE: SalesOrderDetailState = { status: "error", order: null, message: "Your Buyer context changed. Refresh after signing in to continue." };

@Component({
  selector: "portal-buyer-sales-order-detail-page",
  standalone: true,
  imports: [NexaButton, NexaSurface, RouterLink],
  templateUrl: "./buyer-sales-order-detail-page.component.html",
  styleUrl: "./buyer-sales-commitment-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerSalesOrderDetailPageComponent implements OnInit {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly sessions = inject(PortalSessionStore);
  private readonly route = inject(ActivatedRoute);
  private revision = 0;
  private readonly snapshot = signal<{ readonly state: SalesOrderDetailState; readonly lease: PortalLease | null }>({ state: LOADING_STATE, lease: null });
  protected readonly state = computed(() => {
    const current = this.snapshot();
    if (!current.lease) return current.state.status === "error" ? current.state : LOADING_STATE;
    return this.sessions.isSessionLeaseCurrent(current.lease) ? current.state : STALE_CONTEXT_STATE;
  });

  ngOnInit(): void { void this.load(); }
  protected async refresh(): Promise<void> { await this.load(); }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get("orderId");
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.revision;
    if (!id || !lease) {
      this.write({ status: "error", order: null, message: "This order is unavailable in the current Buyer context." }, null);
      return;
    }
    this.write(LOADING_STATE, lease);
    try {
      const response = await firstValueFrom(this.api.getSalesOrder(id));
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      if (!response.body) throw new Error("Empty Sales Order response.");
      this.write({ status: "ready", order: response.body, message: null }, lease);
    } catch {
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      this.write({ status: "error", order: null, message: "This order could not be loaded. Try again." }, lease);
    }
  }

  private write(state: SalesOrderDetailState, lease: PortalLease | null): void {
    this.snapshot.set({ state, lease });
  }
}
