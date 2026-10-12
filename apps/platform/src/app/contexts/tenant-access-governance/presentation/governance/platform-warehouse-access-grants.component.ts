import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PlatformWarehouseAccessGrantsStore } from "../../application/platform-warehouse-access-grants.store";

@Component({
  selector: "platform-warehouse-access-grants",
  standalone: true,
  imports: [NexaButton, NexaSurface],
  providers: [PlatformWarehouseAccessGrantsStore],
  templateUrl: "./platform-warehouse-access-grants.component.html",
  styleUrl: "./tenant-access-governance-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformWarehouseAccessGrantsComponent {
  protected readonly store = inject(PlatformWarehouseAccessGrantsStore);
  protected readonly state = this.store.state;
  protected readonly canManage = this.store.canManage;

  protected refresh(): void {
    this.store.refresh();
  }

  protected selectWarehouse(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement)
      this.store.selectWarehouse(target.value);
  }

  protected previousPage(): void {
    this.store.changePage(-1);
  }

  protected nextPage(): void {
    this.store.changePage(1);
  }

  protected grant(): void {
    void this.store.grant();
  }

  protected revoke(): void {
    void this.store.revoke();
  }

  protected pageCount(total: number, size: number): number {
    return Math.max(1, Math.ceil(total / size));
  }
}
