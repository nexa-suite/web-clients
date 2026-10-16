import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PlatformBusinessDocumentsStore } from "../application/platform-business-documents.store";
import type { PlatformBusinessDocumentListState } from "../application/business-documents.models";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import {
  canAccessPlatformFeature,
  PLATFORM_ACCESS_RULES,
} from "../../../core/platform-access-policy";
import {
  platformBusinessDocumentStatusLabel,
  platformBusinessDocumentTypeLabel,
} from "./business-document-labels";

@Component({
  selector: "platform-business-documents-page",
  standalone: true,
  imports: [DatePipe, NexaButton, NexaSurface, RouterLink],
  templateUrl: "./platform-business-documents-page.component.html",
  styleUrl: "./business-documents-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformBusinessDocumentsPageComponent implements OnInit {
  protected readonly store = inject(PlatformBusinessDocumentsStore);
  private readonly sessions = inject(PlatformSessionStore);
  protected readonly canGenerateOrderSummary = computed(() => {
    const current = this.sessions.state();
    return current.status === "authenticated" && canAccessPlatformFeature(
      current.session,
      PLATFORM_ACCESS_RULES.orderSummaryGeneration,
    );
  });
  protected readonly typeLabel = platformBusinessDocumentTypeLabel;
  protected readonly statusLabel = platformBusinessDocumentStatusLabel;

  ngOnInit(): void {
    void this.store.load();
  }

  protected retry(state: PlatformBusinessDocumentListState): void {
    if (state.kind === "error") void this.store.load(state.requestedPage);
  }

  protected pageBy(offset: number, page: number): void {
    void this.store.changePage(page + offset);
  }

  protected anyDownloadBusy(): boolean {
    return this.store.downloadState().kind === "loading";
  }

  protected downloadBusy(documentId: string): boolean {
    const state = this.store.downloadState();
    return state.kind === "loading" && state.documentId === documentId;
  }
}
