import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { DOCUMENT } from "@angular/common";
import { DestroyRef, Injector, OnInit } from "@angular/core";
import { toObservable } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { filter, take } from "rxjs";
import { NexaButton, NexaSurface, startForegroundRefresh } from "nexa-ui";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerDeliveriesStore } from "../application/buyer-deliveries.store";
@Component({
  selector: "portal-buyer-deliveries",
  imports: [DatePipe, RouterLink, NexaButton, NexaSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="deliveries-heading">
      <h1 id="deliveries-heading">My deliveries</h1>
      <p>Delivery status and schedule reported by this supplier.</p>
      <nexa-button variant="secondary" (click)="store.list(store.state()?.page?.page ?? 0)">Refresh deliveries</nexa-button>
      @if (store.state(); as state) {
        @if (state.loading) { <p role="status">Loading deliveries…</p> }
        @if (state.error) { <p role="alert">{{ state.error }}</p> }
        @if (state.page; as page) {
          @if (!page.items.length) { <p>No deliveries for this account yet.</p> }
          @for (delivery of page.items; track delivery.id) {
            <nexa-surface>
              <h2><a [routerLink]="['/deliveries', delivery.id]">Order {{ delivery.salesOrderNumber }}</a></h2>
              <p>Order: {{ delivery.salesOrderNumber }}</p>
              <p>Status: {{ delivery.status }}</p>
              <p>Scheduled: {{ delivery.scheduledAt ? (delivery.scheduledAt | date: "medium") : "Not scheduled" }}</p>
            </nexa-surface>
          }
          <nav aria-label="Delivery pages">
            <nexa-button [disabled]="page.page === 0" (click)="store.list(page.page - 1)">Previous deliveries</nexa-button>
            <span>Page {{ page.page + 1 }}</span>
            <nexa-button [disabled]="(page.page + 1) * page.size >= page.total" (click)="store.list(page.page + 1)">Next deliveries</nexa-button>
          </nav>
        }
      }
    </section>
  `,
})
export class BuyerDeliveriesPageComponent implements OnInit {
  protected readonly store = inject(BuyerDeliveriesStore);
  private readonly sessions = inject(PortalSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  ngOnInit(): void {
    void this.store.list();
    this.startPolling();
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
      refresh: () => this.store.refreshListForPolling(lease),
    });
  }
}
