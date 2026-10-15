import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DecimalPipe } from "@angular/common";
import { firstValueFrom } from "rxjs";
import {
  NexaApiError,
  NexaPlatformCatalogApi,
  type PlatformCatalogPage,
  type PlatformCatalogProduct,
  type PlatformCatalogTaxonomyPage,
} from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
@Component({
  selector: "platform-catalog-page",
  imports: [FormsModule, DecimalPipe, NexaButton, NexaSurface],
  templateUrl: "./platform-catalog-page.component.html",
  styleUrl: "./platform-catalog-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformCatalogPageComponent implements OnInit {
  private readonly api = inject(NexaPlatformCatalogApi);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private lease: ReturnType<PlatformSessionStore["captureSessionLease"]> = null;
  readonly page = signal<PlatformCatalogPage | null>(null);
  readonly taxonomy = signal<PlatformCatalogTaxonomyPage | null>(null);
  readonly selected = signal<PlatformCatalogProduct | null>(null);
  readonly busy = signal(false);
  readonly error = signal("");
  search = "";
  status = "";
  kind: "products" | "categories" | "brands" = "products";
  constructor() {
    effect(() => {
      const state = this.sessions.state();
      if (
        state.status !== "authenticated" ||
        (this.lease && !this.sessions.isSessionLeaseCurrent(this.lease))
      ) {
        this.page.set(null);
        this.taxonomy.set(null);
        this.selected.set(null);
        this.error.set("");
        this.busy.set(false);
      }
    });
  }
  ngOnInit(): void {
    void this.load();
  }
  async load(page = 0): Promise<void> {
    await this.run(async (current) => {
      if (this.kind === "products") {
        const result = await firstValueFrom(
          this.api.list(this.search.trim(), page, this.status),
        );
        if (!current()) return;
        this.page.set(result);
        this.taxonomy.set(null);
      } else {
        const result = await firstValueFrom(
          this.api.taxonomy(this.kind, this.search.trim(), page),
        );
        if (!current()) return;
        this.taxonomy.set(result);
        this.page.set(null);
      }
      this.selected.set(null);
    });
  }
  async open(id: string): Promise<void> {
    await this.run(async (current) => {
      const product = await firstValueFrom(this.api.detail(id));
      if (current()) this.selected.set(product);
    });
  }
  async changeKind(): Promise<void> {
    this.search = "";
    this.status = "";
    this.page.set(null);
    this.taxonomy.set(null);
    this.selected.set(null);
    await this.load();
  }
  private async run(
    action: (current: () => boolean) => Promise<void>,
  ): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease || this.busy()) return;
    this.lease = lease;
    const current = () =>
      !this.destroyRef.destroyed && this.sessions.isSessionLeaseCurrent(lease);
    this.busy.set(true);
    this.error.set("");
    try {
      await action(current);
    } catch (error: unknown) {
      if (current())
        this.error.set(
          error instanceof NexaApiError && error.kind === "forbidden"
            ? "Your membership cannot read this catalog."
            : "Catalog could not be loaded. Check the connection and refresh.",
        );
    } finally {
      if (current()) this.busy.set(false);
    }
  }
}
