import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { NexaSalesCommitmentApi } from "@nexa/api";
import type { PurchaseRequestDraftPage, PurchaseRequestPage } from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import { firstValueFrom } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";

type RequestsPageState =
  | { readonly status: "loading"; readonly drafts: null; readonly requests: null; readonly message: null }
  | { readonly status: "ready"; readonly drafts: PurchaseRequestDraftPage; readonly requests: PurchaseRequestPage; readonly message: null }
  | { readonly status: "error"; readonly drafts: null; readonly requests: null; readonly message: string };

type PortalLease = NonNullable<ReturnType<PortalSessionStore["captureSessionLease"]>>;
const LOADING_STATE: RequestsPageState = { status: "loading", drafts: null, requests: null, message: null };
const STALE_CONTEXT_STATE: RequestsPageState = { status: "error", drafts: null, requests: null, message: "Your Buyer context changed. Refresh after signing in to continue." };

@Component({
  selector: "portal-buyer-purchase-requests-page",
  standalone: true,
  imports: [NexaButton, NexaSurface, RouterLink],
  templateUrl: "./buyer-purchase-requests-page.component.html",
  styleUrl: "./buyer-sales-commitment-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerPurchaseRequestsPageComponent implements OnInit {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly sessions = inject(PortalSessionStore);
  private revision = 0;
  private readonly snapshot = signal<{ readonly state: RequestsPageState; readonly lease: PortalLease | null }>({ state: LOADING_STATE, lease: null });
  protected readonly state = computed(() => {
    const current = this.snapshot();
    if (!current.lease) return current.state.status === "error" ? current.state : LOADING_STATE;
    return this.sessions.isSessionLeaseCurrent(current.lease) ? current.state : STALE_CONTEXT_STATE;
  });
  protected readonly draftPageIndex = signal(0);
  protected readonly requestPageIndex = signal(0);

  ngOnInit(): void { void this.load(); }

  protected async refresh(): Promise<void> { await this.load(); }

  protected async changeDraftPage(offset: number): Promise<void> {
    const current = this.state();
    if (current.status !== "ready") return;
    const next = current.drafts.page + offset;
    if (next < 0 || next >= current.drafts.totalPages) return;
    this.draftPageIndex.set(next);
    await this.load();
  }

  protected async changeRequestPage(offset: number): Promise<void> {
    const current = this.state();
    if (current.status !== "ready") return;
    const pageCount = this.requestPageCount(current.requests.total, current.requests.size);
    const next = current.requests.page + offset;
    if (next < 0 || next >= pageCount) return;
    this.requestPageIndex.set(next);
    await this.load();
  }

  protected requestPageCount(total: number, size: number): number {
    return Math.max(1, Math.ceil(total / Math.max(size, 1)));
  }

  private async load(): Promise<void> {
    const revision = ++this.revision;
    const lease = this.sessions.captureSessionLease();
    if (!lease) {
      this.write({ status: "error", drafts: null, requests: null, message: "A current Buyer session is required to load requests." }, null);
      return;
    }
    this.write(LOADING_STATE, lease);
    try {
      const [drafts, requests] = await Promise.all([
        firstValueFrom(this.api.listDrafts(this.draftPageIndex(), 50)),
        firstValueFrom(this.api.listPurchaseRequests({ page: this.requestPageIndex(), size: 50, sort: "createdAt,desc" })),
      ]);
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      this.write({ status: "ready", drafts, requests, message: null }, lease);
    } catch {
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      this.write({ status: "error", drafts: null, requests: null, message: "Your requests could not be loaded. Try again." }, lease);
    }
  }

  private write(state: RequestsPageState, lease: PortalLease | null): void {
    this.snapshot.set({ state, lease });
  }
}
