import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, inject } from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { DOCUMENT } from "@angular/common";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { filter, Subscription, take, tap } from "rxjs";
import type { BuyerDeliveryLocationSample } from "@nexa/api";
import { NexaButton, NexaSurface, startForegroundRefresh } from "nexa-ui";
import { PORTAL_DELIVERY_MAP_CONFIGURATION } from "../../../core/portal-delivery-map-configuration";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerDeliveriesStore } from "../application/buyer-deliveries.store";
import { buildBuyerDeliveryLiveMap, isCurrentLocation } from "./buyer-delivery-live-map";
@Component({
  selector: "portal-buyer-delivery-detail",
  imports: [DatePipe, DecimalPipe, RouterLink, NexaButton, NexaSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .delivery-live-map { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(3, minmax(0, 1fr)); width: min(100%, 48rem); aspect-ratio: 1; overflow: hidden; background: #e2e8f0; }
    .delivery-live-map img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .delivery-live-marker { position: absolute; width: 16px; height: 16px; transform: translate(-50%, -50%); border: 3px solid white; border-radius: 50%; background: #2563eb; box-shadow: 0 1px 5px rgb(15 23 42 / 55%); }
    .delivery-live-accuracy { position: absolute; top: 50%; left: 50%; display: block; transform: translate(-50%, -50%); border: 2px solid rgb(37 99 235 / 55%); border-radius: 50%; background: rgb(37 99 235 / 16%); }
  `],
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
        @if (isTrackable(delivery.status)) {
          <nexa-surface>
            <h2>Live delivery location</h2>
            @if (state.liveTrackingTerminal) {
              <p role="status">Live location is no longer available for this delivery.</p>
            } @else if (state.liveLocation; as location) {
              @if (isCurrent(location)) {
                <p>Latest sample: {{ location.capturedAt | date: "medium" }} · accuracy {{ location.accuracyMeters | number: "1.0-0" }} m</p>
                @if (mapConfiguration; as configuration) {
                  @if (mapFor(location); as map) {
                    <div class="delivery-live-map" role="img" aria-label="Map showing latest authorized driver location">
                      @for (tile of map.tiles; track tile.key) {
                        <img [src]="tile.url" alt="" loading="lazy" referrerpolicy="no-referrer" [style.gridColumn]="tile.column" [style.gridRow]="tile.row" />
                      }
                      <span class="delivery-live-marker" [style.left.%]="map.markerLeftPercent" [style.top.%]="map.markerTopPercent">
                        <span class="delivery-live-accuracy" [style.width.px]="map.accuracyDiameterPixels" [style.height.px]="map.accuracyDiameterPixels"></span>
                      </span>
                    </div>
                    <p>
                      @if (configuration.attributionUrl; as attributionUrl) {
                        <a [href]="attributionUrl" target="_blank" rel="noreferrer">{{ configuration.attribution }}</a>
                      } @else { {{ configuration.attribution }} }
                    </p>
                  } @else {
                    <p role="status">Current location sample is invalid or expired; map is hidden.</p>
                  }
                } @else {
                  <p>Location sample available. Map tiles are not configured for this Portal.</p>
                }
              } @else {
                <p role="status">No current driver location sample is available.</p>
              }
            } @else {
              <p>No current driver location sample is available yet.</p>
            }
          </nexa-surface>
        }
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
export class BuyerDeliveryDetailPageComponent implements OnInit {
  protected readonly store = inject(BuyerDeliveriesStore);
  protected readonly mapConfiguration = inject(PORTAL_DELIVERY_MAP_CONFIGURATION);
  private readonly route = inject(ActivatedRoute);
  private readonly sessions = inject(PortalSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private polling?: Subscription;
  private id = "";
  constructor() {
    this.destroyRef.onDestroy(() => {
      this.polling?.unsubscribe();
      if (this.id) this.store.clearDeliveryState(this.id);
    });
  }
  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.polling?.unsubscribe();
      if (this.id) this.store.clearDeliveryState(this.id);
      this.id = params.get("id") ?? "";
      if (!this.id) return;
      void this.store.detail(this.id);
      this.startPolling(this.id);
    });
  }
  protected refresh(): void { if (this.id) void this.store.detail(this.id); }
  protected isTrackable(status: string): boolean { return status === "DISPATCHED" || status === "IN_TRANSIT"; }
  protected isCurrent(location: BuyerDeliveryLocationSample): boolean { return isCurrentLocation(location); }
  protected mapFor(location: BuyerDeliveryLocationSample) { return buildBuyerDeliveryLiveMap(location, this.mapConfiguration); }

  private startPolling(id: string): void {
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    const stopWhen = toObservable(this.sessions.state, { injector: this.injector }).pipe(
      filter(() => !this.sessions.isSessionLeaseCurrent(lease)),
      take(1),
      tap(() => this.store.clearForStaleScope(lease)),
    );
    this.polling = startForegroundRefresh({
      document: this.document,
      destroyRef: this.destroyRef,
      stopWhen,
      refresh: () => this.store.refreshDetailForPolling(id, lease),
    });
  }
}
