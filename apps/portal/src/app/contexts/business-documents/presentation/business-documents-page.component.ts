import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import { BuyerBusinessDocumentsStore } from "../application/buyer-business-documents.store";
import type {
  BusinessDocumentListState,
  BuyerBusinessDocument,
} from "../application/business-documents.models";
import {
  businessDocumentStatusLabel,
  businessDocumentTypeLabel,
} from "./business-document-labels";

@Component({
  selector: "portal-business-documents-page",
  standalone: true,
  imports: [DatePipe, NexaButton, NexaSurface, RouterLink],
  templateUrl: "./business-documents-page.component.html",
  styleUrl: "./business-documents-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessDocumentsPageComponent implements OnInit {
  protected readonly store = inject(BuyerBusinessDocumentsStore);
  protected readonly documentTypeLabel = businessDocumentTypeLabel;
  protected readonly statusLabel = businessDocumentStatusLabel;

  ngOnInit(): void {
    void this.store.load();
  }

  protected retry(state: BusinessDocumentListState): void {
    if (state.kind === "error") void this.store.load(state.requestedPage);
  }

  protected pageBy(offset: number, page: number): void {
    void this.store.changePage(page + offset);
  }

  protected download(document: BuyerBusinessDocument): void {
    void this.store.download(document);
  }

  protected downloadBusy(documentId: string): boolean {
    const state = this.store.downloadState();
    return state.kind === "loading" && state.documentId === documentId;
  }

  protected anyDownloadBusy(): boolean {
    return this.store.downloadState().kind === "loading";
  }
}
