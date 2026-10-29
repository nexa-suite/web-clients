import { DOCUMENT } from "@angular/common";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  inject,
  OnInit,
} from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  NexaButton,
  NexaStatusChip,
  NexaSurface,
  startForegroundRefresh,
} from "nexa-ui";
import { catchError, filter, from, map, of, take } from "rxjs";
import type { Subscription } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerRequestSelectionStore } from "../../sales-commitment/application/public-api";
import type { BuyerCatalogItem } from "../application/public-api";
import { CatalogStore } from "../application/public-api";
import { catalogImageFraming } from "./catalog-image-framing";

@Component({
  selector: "portal-catalog-detail-page",
  standalone: true,
  imports: [NexaButton, NexaStatusChip, NexaSurface, RouterLink],
  templateUrl: "./catalog-detail-page.component.html",
  styleUrl: "./catalog-detail-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogDetailPageComponent implements OnInit {
  protected readonly store = inject(CatalogStore);
  protected readonly requestSelection = inject(BuyerRequestSelectionStore);
  protected readonly route = inject(ActivatedRoute);
  protected readonly imageFraming = catalogImageFraming;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly sessions = inject(PortalSessionStore);
  private polling?: Subscription;

  protected addToRequest(item: BuyerCatalogItem): void {
    this.requestSelection.add(item);
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const catalogItemId = params.get("catalogItemId");
        this.polling?.unsubscribe();
        if (!catalogItemId) return;
        void this.store.loadDetail(catalogItemId);
        this.startPolling(catalogItemId);
      });
  }

  private startPolling(catalogItemId: string): void {
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    const stopWhen = toObservable(this.sessions.state, {
      injector: this.injector,
    }).pipe(
      filter(() => !this.sessions.isSessionLeaseCurrent(lease)),
      take(1),
    );
    this.polling = startForegroundRefresh({
      document: this.document,
      destroyRef: this.destroyRef,
      stopWhen,
      refresh: () => {
        if (
          !this.sessions.isSessionLeaseCurrent(lease) ||
          this.store.detail().kind === "loading"
        ) {
          return of(this.sessions.isSessionLeaseCurrent(lease));
        }
        return from(this.store.refreshDetail(catalogItemId)).pipe(
          map(() => this.sessions.isSessionLeaseCurrent(lease)),
          catchError(() => of(true)),
        );
      },
    });
  }
}
