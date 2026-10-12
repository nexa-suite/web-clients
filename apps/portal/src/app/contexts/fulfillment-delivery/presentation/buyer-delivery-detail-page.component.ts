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
          <h2>Order {{ delivery.salesOrderNumber }}</h2>
          <dl>
            <dt>Status</dt><dd>{{ delivery.status }}</dd>
            <dt>Destination</dt><dd>{{ delivery.destination ?? "Not available" }}</dd>
            <dt>Scheduled</dt><dd>{{ delivery.scheduledAt ? (delivery.scheduledAt | date: "medium") : "Not scheduled" }}</dd>
            <dt>Dispatched</dt><dd>{{ delivery.dispatchedAt ? (delivery.dispatchedAt | date: "medium") : "Not available" }}</dd>
            <dt>Delivered</dt><dd>{{ delivery.deliveredAt ? (delivery.deliveredAt | date: "medium") : "Not available" }}</dd>
            <dt>Proof of delivery</dt><dd>{{ delivery.proofOfDeliveryStatus ?? "Not available" }}</dd>
            <dt>Updated</dt><dd>{{ delivery.updatedAt | date: "medium" }}</dd>
          </dl>
        </nexa-surface>
        <h2>Delivery history</h2>
        @if (!state.events.length) { <p>No delivery events available yet.</p> }
        <ol>
          @for (event of state.events; track $index) {
            <li>{{ event.occurredAt | date: "medium" }} · {{ event.type }}</li>
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
