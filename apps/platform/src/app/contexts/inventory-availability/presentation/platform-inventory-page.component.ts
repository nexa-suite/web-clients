import { DOCUMENT, DecimalPipe, DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, inject } from "@angular/core";
import { toObservable } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { NexaButton, NexaSurface, startForegroundRefresh } from "nexa-ui";
import { filter, from, take } from "rxjs";
import {
  PlatformInventoryReceivingStore,
  type WarehouseReceiptDraft,
} from "../application/platform-inventory-receiving.store";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";

@Component({
  selector: "platform-inventory-page",
  imports: [FormsModule, DecimalPipe, DatePipe, NexaButton, NexaSurface],
  providers: [PlatformInventoryReceivingStore],
  templateUrl: "./platform-inventory-page.component.html",
  styleUrl: "./platform-inventory-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformInventoryPageComponent {
  protected readonly store = inject(PlatformInventoryReceivingStore);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly sessions = inject(PlatformSessionStore);

  constructor() {
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
      refresh: () => from(this.store.refreshLotsForPolling(lease)),
    });
  }

  protected searchCatalog(): void {
    void this.store.searchCatalog();
  }

  protected selectCatalogItem(catalogItemId: string): void {
    const item = this.store.catalogPage()?.items.find(
      (candidate) => candidate.catalogItemId === catalogItemId,
    );
    this.store.setCatalogFilter(item ?? null);
  }

  protected updateDraft<K extends keyof WarehouseReceiptDraft>(
    field: K,
    value: WarehouseReceiptDraft[K],
  ): void {
    this.store.updateReceiptDraft({ [field]: value } as Pick<WarehouseReceiptDraft, K>);
  }

  protected selectEvidenceFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = "";
    void this.store.selectEvidenceFile(file);
  }

  protected zoneLabel(zoneId: string): string {
    return this.store.zones().find((zone) => zone.id === zoneId)?.name ?? zoneId;
  }

  protected warehouseLabel(warehouseId: string): string {
    const warehouse = this.store.warehouses().find((item) => item.id === warehouseId);
    return warehouse ? `${warehouse.code} · ${warehouse.name}` : warehouseId;
  }
}
