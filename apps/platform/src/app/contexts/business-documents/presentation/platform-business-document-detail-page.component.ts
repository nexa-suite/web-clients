import { DatePipe } from "@angular/common";
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
import { PlatformBusinessDocumentsStore } from "../application/platform-business-documents.store";
import type { PlatformBusinessDocument } from "../application/business-documents.models";
import {
  platformBusinessDocumentStatusLabel,
  platformBusinessDocumentSubjectLabel,
  platformBusinessDocumentTypeLabel,
} from "./business-document-labels";

@Component({
  selector: "platform-business-document-detail-page",
  standalone: true,
  imports: [DatePipe, NexaButton, NexaSurface, RouterLink],
  templateUrl: "./platform-business-document-detail-page.component.html",
  styleUrl: "./business-documents-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformBusinessDocumentDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(PlatformBusinessDocumentsStore);
  protected readonly typeLabel = platformBusinessDocumentTypeLabel;
  protected readonly statusLabel = platformBusinessDocumentStatusLabel;
  protected readonly subjectLabel = platformBusinessDocumentSubjectLabel;
  protected documentId = "";

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.documentId = params.get("documentId") ?? "";
        void this.store.loadDetail(this.documentId);
      });
  }

  protected retry(): void {
    void this.store.loadDetail(this.documentId);
  }

  protected download(document: PlatformBusinessDocument): void {
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
