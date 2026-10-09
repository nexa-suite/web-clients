import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import type { PlatformOrderSummaryCandidatesState } from "../application/business-documents.models";
import { PlatformOrderSummaryGenerationStore } from "../application/platform-order-summary-generation.store";

@Component({
  selector: "platform-order-summary-candidates-page",
  standalone: true,
  imports: [NexaButton, NexaSurface, RouterLink],
  templateUrl: "./platform-order-summary-candidates-page.component.html",
  styleUrl: "./business-documents-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformOrderSummaryCandidatesPageComponent implements OnInit {
  protected readonly store = inject(PlatformOrderSummaryGenerationStore);
  protected readonly orderStatusLabel = humanizeStatus;

  ngOnInit(): void {
    void this.store.loadCandidates();
  }

  protected retry(state: PlatformOrderSummaryCandidatesState): void {
    if (state.kind === "error") void this.store.loadCandidates(state.requestedPage);
  }

  protected pageBy(offset: number, page: number): void {
    void this.store.changeCandidatePage(page + offset);
  }
}

function humanizeStatus(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
