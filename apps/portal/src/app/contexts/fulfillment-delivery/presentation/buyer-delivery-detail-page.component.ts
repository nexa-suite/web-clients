import { ChangeDetectionStrategy, Component, DestroyRef, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import { BuyerDeliveriesStore } from "../application/buyer-deliveries.store";
@Component({
  selector: "portal-buyer-delivery-detail",
  imports: [DatePipe, RouterLink, NexaButton, NexaSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/deliveries">All deliveries</a>
    <h1>Delivery tracking</h1>
    <nexa-button variant="secondary" (click)="refresh()">Refresh delivery</nexa-button>
    @if (store.state(); as state) {
      @if (state.loading) { <p role="status">Loading delivery…</p> }
      @if (state.error) { <p role="alert">{{ state.error }}</p> }
      @if (state.detail; as delivery) {
        <nexa-surface>
          <h2>{{ delivery.dispatchNumber }}</h2>
          <dl>
            <dt>Order</dt><dd>{{ delivery.salesOrderNumber }}</dd>
            <dt>Status</dt><dd>{{ delivery.status }}</dd>
            <dt>Destination</dt><dd>{{ delivery.destination ?? "Not available" }}</dd>
            <dt>Window starts</dt><dd>{{ delivery.deliveryWindowStart ? (delivery.deliveryWindowStart | date: "medium") : "Not scheduled" }}</dd>
            <dt>Window ends</dt><dd>{{ delivery.deliveryWindowEnd ? (delivery.deliveryWindowEnd | date: "medium") : "Not scheduled" }}</dd>
            <dt>Estimated arrival</dt><dd>{{ delivery.eta ? (delivery.eta | date: "medium") : "Not available" }}</dd>
            <dt>Proof of delivery</dt><dd>{{ delivery.podStatus ?? "Not issued" }}</dd>
            <dt>Updated</dt><dd>{{ delivery.updatedAt | date: "medium" }}</dd>
          </dl>
          @for (alert of delivery.alerts; track alert) { <p role="status">{{ alert }}</p> }
          @if (delivery.continuationDeliveryStatus) { <p>Remaining delivery: {{ delivery.continuationDeliveryStatus }}</p> }
        </nexa-surface>
        <h2>Delivery history</h2>
        @if (!state.events.length) { <p>No delivery events available yet.</p> }
        <ol>
          @for (event of state.events; track event.id) {
            <li>{{ event.occurredAt | date: "medium" }} · {{ event.summary }}</li>
          }
        </ol>
      }
    }
  `,
})
export class BuyerDeliveryDetailPageComponent {
  protected readonly store = inject(BuyerDeliveriesStore);
  private readonly route = inject(ActivatedRoute);
  private id = "";
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(params => {
      this.id = params.get("id") ?? "";
      if (this.id) void this.store.detail(this.id);
    });
  }
  protected refresh(): void { if (this.id) void this.store.detail(this.id); }
}
