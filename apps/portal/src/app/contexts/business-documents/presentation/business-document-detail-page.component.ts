import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import { BuyerBusinessDocumentsStore } from "../application/buyer-business-documents.store";
import type { BuyerBusinessDocument } from "../application/business-documents.models";
import {
  businessDocumentStatusLabel,
  businessDocumentSubjectLabel,
  businessDocumentTypeLabel,
} from "./business-document-labels";

@Component({
  selector: "portal-business-document-detail-page",
  standalone: true,
  imports: [DatePipe, NexaButton, NexaSurface, RouterLink],
  templateUrl: "./business-document-detail-page.component.html",
  styleUrl: "./business-document-detail-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessDocumentDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(BuyerBusinessDocumentsStore);
  protected readonly typeLabel = businessDocumentTypeLabel;
  protected readonly statusLabel = businessDocumentStatusLabel;
  protected readonly subjectLabel = businessDocumentSubjectLabel;
  protected readonly documentId =
    this.route.snapshot.paramMap.get("documentId") ?? "";

  ngOnInit(): void {
    void this.store.loadDetail(this.documentId);
  }

  protected retry(): void {
    void this.store.loadDetail(this.documentId);
  }

  protected download(document: BuyerBusinessDocument): void {
    void this.store.download(document);
  }

  protected downloadBusy(documentId: string): boolean {
    const state = this.store.downloadState();
    return state.kind === "loading" && state.documentId === documentId;
  }

  protected formatBytes(bytes: number): string {
    if (bytes < 1_024) return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
}
