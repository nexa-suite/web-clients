import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PlatformBusinessDocumentsStore } from "../application/platform-business-documents.store";
import type { PlatformBusinessDocumentListState } from "../application/business-documents.models";
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
