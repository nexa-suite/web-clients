import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { distinctUntilChanged, map } from "rxjs";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PlatformPurchaseRequestMaterialChangeStore } from "../application/platform-purchase-request-material-change.store";

@Component({
  selector: "platform-purchase-request-material-change-page",
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, NexaButton, NexaSurface],
  templateUrl:
    "./platform-purchase-request-material-change-page.component.html",
  styleUrl: "./platform-sales-commitment-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformPurchaseRequestMaterialChangePageComponent implements OnInit {
  protected readonly store = inject(PlatformPurchaseRequestMaterialChangeStore);
  protected readonly state = this.store.state;
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly priorities = ["NORMAL", "HIGH", "URGENT"];
  protected readonly paymentOptions = [
    "CREDIT_LINE",
    "BANK_TRANSFER",
    "CARD_STRIPE",
    "WALLET",
    "CASH",
    "CASH_ON_DELIVERY",
    "PREPAID",
    "IMMEDIATE",
  ];

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map((params) => params.get("requestId") ?? ""),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((requestId) => void this.store.load(requestId));
  }

  protected async refresh(): Promise<void> {
    await this.store.load(this.requestId());
  }

  private requestId(): string {
    return this.route.snapshot.paramMap.get("requestId") ?? "";
  }
}
