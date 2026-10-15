import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import { Observable, catchError, combineLatest, filter, firstValueFrom, map, of, take, tap } from "rxjs";
import {
  NexaApiError,
  NexaSalesCommitmentApi,
  type SalesOrder,
  type SalesOrderPage,
} from "@nexa/api";
import { NexaButton, NexaSurface, startForegroundRefresh } from "nexa-ui";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private revision = 0;
  private loadedPage = 0;
  private appliedQuery = { search: "", status: "", clientAccountId: "" };
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
    this.startPolling();
  }
  protected async load(page = 0): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.revision;
    if (!lease) return;
    this.loadedPage = page;
    this.appliedQuery = {
      search: this.search.trim(),
      status: this.status,
      clientAccountId: this.clientAccountId,
    };
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
            status: this.appliedQuery.status,
            clientAccountId: this.appliedQuery.clientAccountId,
            search: this.appliedQuery.search,
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

  private startPolling(): void {
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    const stopWhen = toObservable(this.sessions.state, { injector: this.injector }).pipe(
      filter(() => !this.sessions.isSessionLeaseCurrent(lease)),
      take(1),
    );
    startForegroundRefresh({
      document: this.document,
      destroyRef: this.destroyRef,
      stopWhen,
      refresh: () => this.refreshReadModel(lease),
    });
  }

  private refreshReadModel(lease: PlatformSessionLease): Observable<boolean> {
    if (!this.sessions.isSessionLeaseCurrent(lease) || this.snapshot().busy) return of(true);
    const revision = ++this.revision;
    const current = () =>
      !this.destroyRef.destroyed &&
      revision === this.revision &&
      this.sessions.isSessionLeaseCurrent(lease);
    const id = this.route.snapshot.paramMap.get("orderId");
    const request: Observable<boolean> = id
      ? this.api.getSalesOrder(id).pipe(
          tap((response) => {
            if (!current() || !response.body || response.body.id !== id) return;
            this.snapshot.set({ lease, busy: false, error: "", page: null, order: response.body });
          }),
          map(() => current()),
        )
      : this.api.listSalesOrders({
          page: this.loadedPage,
          size: 25,
          sort: "createdAt,desc",
          status: this.appliedQuery.status,
          clientAccountId: this.appliedQuery.clientAccountId,
          search: this.appliedQuery.search,
        }).pipe(
          tap((page) => {
            if (!current()) return;
            this.loadedPage = page.page;
            this.snapshot.update((state) => ({ ...state, lease, busy: false, error: "", page, order: null }));
          }),
          map(() => current()),
        );

    return request.pipe(
      catchError((error: unknown) => {
        if (!current()) return of(false);
        if (error instanceof NexaApiError && (error.kind === "unauthenticated" || error.kind === "forbidden")) {
          if (error.kind === "unauthenticated") {
            if (this.sessions.expireSessionIfCurrent(lease)) {
              void this.router.navigate(["/sign-in"], { queryParams: { returnUrl: this.router.url } });
            }
          } else if (error.problem?.code === "ACCESS_CONTEXT_INVALID") {
            if (this.sessions.invalidateContextIfCurrent(lease)) {
              void this.router.navigate(["/sign-in"], { queryParams: { returnUrl: this.router.url } });
            }
          }
          this.snapshot.set({ lease, busy: false, error: "Your current membership cannot read Sales Orders.", page: null, order: null });
          return of(false);
        }
        this.snapshot.update((state) => ({ ...state, busy: false, error: "Sales Orders could not be refreshed. The last loaded results remain visible." }));
        return of(true);
      }),
    );
  }
}
