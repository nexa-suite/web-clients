import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { combineLatest, firstValueFrom } from "rxjs";
import {
  NexaApiError,
  NexaSalesCommitmentApi,
  type SalesOrder,
  type SalesOrderPage,
} from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import {
  canAccessPlatformFeature,
  PLATFORM_ACCESS_RULES,
  type PlatformAccessRule,
} from "../../../core/platform-access-policy";

@Component({
  selector: "platform-sales-orders-page",
  imports: [FormsModule, RouterLink, NexaButton, NexaSurface],
  templateUrl: "./platform-sales-orders-page.component.html",
  styleUrl: "./platform-sales-commitment-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformSalesOrdersPageComponent implements OnInit {
  private readonly api = inject(NexaSalesCommitmentApi);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private revision = 0;
  private readonly snapshot = signal({
    lease: this.sessions.captureSessionLease(),
    busy: false,
    error: "",
    page: null as SalesOrderPage | null,
    order: null as SalesOrder | null,
  });
  protected readonly state = computed(() => {
    const value = this.snapshot();
    return value.lease && this.sessions.isSessionLeaseCurrent(value.lease)
      ? value
      : {
          lease: null,
          busy: false,
          page: null,
          order: null,
          error:
            "Your Platform context changed. Refresh to load current orders.",
        };
  });
  protected search = "";
  protected status = "";
  protected clientAccountId = "";
  protected readonly canViewClient = computed(() =>
    this.allowed(PLATFORM_ACCESS_RULES.clients),
  );
  protected readonly canViewRequests = computed(() =>
    this.allowed(PLATFORM_ACCESS_RULES.purchaseRequests),
  );
  protected readonly canViewFulfillment = computed(() =>
    this.allowed(PLATFORM_ACCESS_RULES.fulfillment),
  );
  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([, query]) => {
        this.clientAccountId = query.get("clientAccountId") ?? "";
        void this.load();
      });
  }
  protected async load(page = 0): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.revision;
    if (!lease) return;
    this.snapshot.set({
      lease,
      busy: true,
      error: "",
      page: null,
      order: null,
    });
    const current = () =>
      !this.destroyRef.destroyed &&
      revision === this.revision &&
      this.sessions.isSessionLeaseCurrent(lease);
    try {
      const id = this.route.snapshot.paramMap.get("orderId");
      if (id) {
        const response = await firstValueFrom(this.api.getSalesOrder(id));
        if (!current()) return;
        if (!response.body || response.body.id !== id)
          throw new Error("Order unavailable");
        this.snapshot.set({
          lease,
          busy: false,
          error: "",
          page: null,
          order: response.body,
        });
      } else {
        const result = await firstValueFrom(
          this.api.listSalesOrders({
            page,
            size: 25,
            sort: "createdAt,desc",
            status: this.status,
            clientAccountId: this.clientAccountId,
            search: this.search.trim(),
          }),
        );
        if (current())
          this.snapshot.set({
            lease,
            busy: false,
            error: "",
            page: result,
            order: null,
          });
      }
    } catch (error: unknown) {
      if (current())
        this.snapshot.set({
          lease,
          busy: false,
          page: null,
          order: null,
          error:
            error instanceof NexaApiError && error.kind === "forbidden"
              ? "Your active membership cannot read Sales Orders."
              : error instanceof NexaApiError && error.kind === "not-found"
                ? "This Sales Order is unavailable in your workspace."
                : "Sales Orders could not be loaded. Refresh to try again.",
        });
    }
  }
  private allowed(rule: PlatformAccessRule): boolean {
    const state = this.sessions.state();
    return (
      state.status === "authenticated" &&
      canAccessPlatformFeature(state.session, rule)
    );
  }
}
