import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PlatformOrderSummaryGenerationStore } from "../application/platform-order-summary-generation.store";
import { platformBusinessDocumentStatusLabel } from "./business-document-labels";

@Component({
  selector: "platform-order-summary-generation-page",
  standalone: true,
  imports: [NexaButton, NexaSurface, RouterLink],
  templateUrl: "./platform-order-summary-generation-page.component.html",
  styleUrl: "./business-documents-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformOrderSummaryGenerationPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(PlatformOrderSummaryGenerationStore);
  protected readonly statusLabel = platformBusinessDocumentStatusLabel;
  protected readonly orderStatusLabel = humanizeStatus;
  protected salesOrderId = "";

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.salesOrderId = params.get("salesOrderId") ?? "";
        void this.store.loadOrder(this.salesOrderId);
      });
  }

  protected retry(): void {
    const state = this.store.requestState();
    if (state.kind === "error" && state.order) {
      void this.store.requestOrderSummaryPdf();
    } else {
      void this.store.loadOrder(this.salesOrderId);
    }
  }
}

function humanizeStatus(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
