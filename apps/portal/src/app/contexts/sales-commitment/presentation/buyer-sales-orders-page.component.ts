import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { NexaSalesCommitmentApi } from "@nexa/api";
import type { SalesOrderPage } from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import { firstValueFrom } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";

type SalesOrdersState =
  | { readonly status: "loading"; readonly page: null; readonly message: null }
  | { readonly status: "ready"; readonly page: SalesOrderPage; readonly message: null }
  | { readonly status: "error"; readonly page: null; readonly message: string };

type PortalLease = NonNullable<ReturnType<PortalSessionStore["captureSessionLease"]>>;
const LOADING_STATE: SalesOrdersState = { status: "loading", page: null, message: null };
const STALE_CONTEXT_STATE: SalesOrdersState = { status: "error", page: null, message: "Your Buyer context changed. Refresh after signing in to continue." };

@Component({
  selector: "portal-buyer-sales-orders-page",
  standalone: true,
  imports: [NexaButton, NexaSurface, RouterLink],
  templateUrl: "./buyer-sales-orders-page.component.html",
  styleUrl: "./buyer-sales-commitment-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerSalesOrdersPageComponent implements OnInit {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly sessions = inject(PortalSessionStore);
  private revision = 0;
  private readonly snapshot = signal<{ readonly state: SalesOrdersState; readonly lease: PortalLease | null }>({ state: LOADING_STATE, lease: null });
  protected readonly state = computed(() => {
    const current = this.snapshot();
    if (!current.lease) return current.state.status === "error" ? current.state : LOADING_STATE;
    return this.sessions.isSessionLeaseCurrent(current.lease) ? current.state : STALE_CONTEXT_STATE;
  });
  protected readonly pageIndex = signal(0);

  ngOnInit(): void { void this.load(); }
  protected async refresh(): Promise<void> { await this.load(); }
  protected async changePage(offset: number): Promise<void> {
    const current = this.state();
    if (current.status !== "ready") return;
    const totalPages = Math.max(1, Math.ceil(current.page.total / Math.max(current.page.size, 1)));
    const next = current.page.page + offset;
    if (next < 0 || next >= totalPages) return;
    this.pageIndex.set(next);
    await this.load();
  }

  protected pageCount(total: number, size: number): number {
    return Math.max(1, Math.ceil(total / Math.max(size, 1)));
  }

  private async load(): Promise<void> {
    const revision = ++this.revision;
    const lease = this.sessions.captureSessionLease();
    if (!lease) {
      this.write({ status: "error", page: null, message: "A current Buyer session is required to load orders." }, null);
      return;
    }
    this.write(LOADING_STATE, lease);
    try {
      const page = await firstValueFrom(this.api.listSalesOrders({ page: this.pageIndex(), size: 50, sort: "createdAt,desc" }));
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      this.write({ status: "ready", page, message: null }, lease);
    } catch {
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      this.write({ status: "error", page: null, message: "Orders could not be loaded. Try again." }, lease);
    }
  }

  private write(state: SalesOrdersState, lease: PortalLease | null): void {
    this.snapshot.set({ state, lease });
  }
}
