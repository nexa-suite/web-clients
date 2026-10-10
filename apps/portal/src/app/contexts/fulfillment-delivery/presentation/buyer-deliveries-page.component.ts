import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
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
export class BuyerDeliveriesPageComponent {
  protected readonly store = inject(BuyerDeliveriesStore);
  constructor() { void this.store.list(); }
}
