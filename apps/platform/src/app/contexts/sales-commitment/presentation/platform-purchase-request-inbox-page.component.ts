import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { NexaApiError, NexaSalesCommitmentApi } from "@nexa/api";
import type { PurchaseRequestPage, PurchaseRequestSummary } from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import { firstValueFrom } from "rxjs";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";

type InboxState =
  | { readonly status: "loading"; readonly requests: null; readonly page: null; readonly totalPages: 0; readonly message: null }
  | { readonly status: "ready"; readonly requests: readonly PurchaseRequestSummary[]; readonly page: number; readonly totalPages: number; readonly message: null }
  | { readonly status: "error"; readonly requests: null; readonly page: null; readonly totalPages: 0; readonly message: string };

type PlatformLease = NonNullable<ReturnType<PlatformSessionStore["captureSessionLease"]>>;
const LOADING_STATE: InboxState = { status: "loading", requests: null, page: null, totalPages: 0, message: null };
const STALE_CONTEXT_STATE: InboxState = { status: "error", requests: null, page: null, totalPages: 0, message: "Your Platform context changed. Refresh after signing in to continue." };

@Component({
  selector: "platform-purchase-request-inbox-page",
  standalone: true,
  imports: [NexaButton, NexaSurface, RouterLink],
  templateUrl: "./platform-purchase-request-inbox-page.component.html",
  styleUrl: "./platform-sales-commitment-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformPurchaseRequestInboxPageComponent implements OnInit {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly sessions = inject(PlatformSessionStore);
  private revision = 0;
  private readonly snapshot = signal<{ readonly state: InboxState; readonly lease: PlatformLease | null }>({ state: LOADING_STATE, lease: null });
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
    const next = current.page + offset;
    if (next < 0 || next >= current.totalPages) return;
    this.pageIndex.set(next);
    await this.load();
  }

  private async load(): Promise<void> {
    const revision = ++this.revision;
    const lease = this.sessions.captureSessionLease();
    if (!lease) {
      this.write({ status: "error", requests: null, page: null, totalPages: 0, message: "A current Platform context is required to load the Sales inbox." }, null);
      return;
    }
    this.write(LOADING_STATE, lease);
    try {
      const [submitted, changed] = await Promise.all([
        firstValueFrom(this.api.listPurchaseRequests({ status: "SUBMITTED", page: this.pageIndex(), size: 50, sort: "createdAt,desc" })),
        firstValueFrom(this.api.listPurchaseRequests({ status: "CHANGES_PROPOSED", page: this.pageIndex(), size: 50, sort: "createdAt,desc" })),
      ]);
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      const requests = [...submitted.items, ...changed.items];
      this.write({
        status: "ready",
        requests,
        page: this.pageIndex(),
        totalPages: Math.max(pageCount(submitted), pageCount(changed)),
        message: null,
      }, lease);
    } catch (error: unknown) {
      if (revision !== this.revision || !this.sessions.isSessionLeaseCurrent(lease)) return;
      const forbidden = error instanceof NexaApiError && error.kind === "forbidden";
      this.write({
        status: "error",
        requests: null,
        page: null,
        totalPages: 0,
        message: forbidden
          ? "Your active Platform membership cannot read the Sales inbox. The API requires Sales read access."
          : "Purchase requests could not be loaded. Try again.",
      }, lease);
    }
  }

  private write(state: InboxState, lease: PlatformLease | null): void {
    this.snapshot.set({ state, lease });
  }
}

function pageCount(page: PurchaseRequestPage): number {
  return Math.max(1, Math.ceil(page.total / Math.max(page.size, 1)));
}
