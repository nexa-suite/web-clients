import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { NexaButton, NexaSurface } from "nexa-ui";
import { PlatformPurchaseRequestReviewStore } from "../application/platform-purchase-request-review.store";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";

@Component({
  selector: "platform-purchase-request-review-page",
  standalone: true,
  imports: [NgTemplateOutlet, NexaButton, NexaSurface, RouterLink],
  templateUrl: "./platform-purchase-request-review-page.component.html",
  styleUrl: "./platform-sales-commitment-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformPurchaseRequestReviewPageComponent implements OnInit {
  protected readonly store = inject(PlatformPurchaseRequestReviewStore);
  protected readonly state = this.store.state;
  private readonly route = inject(ActivatedRoute);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly reviewNoteSnapshot = signal({ lease: this.sessions.captureSessionLease(), value: "" });
  protected readonly reviewNote = computed(() => {
    const current = this.reviewNoteSnapshot();
    return current.lease && this.sessions.isSessionLeaseCurrent(current.lease) ? current.value : "";
  });

  constructor() {
    effect(() => {
      const current = this.reviewNoteSnapshot();
      if (current.lease && !this.sessions.isSessionLeaseCurrent(current.lease)) {
        this.reviewNoteSnapshot.set({ lease: null, value: "" });
      }
    });
  }

  ngOnInit(): void {
    const requestId = this.route.snapshot.paramMap.get("requestId") ?? "";
    void this.store.load(requestId).then(() => {
      if (this.state().pendingAction === "reject") this.setReviewNote(this.state().pendingNote);
    });
  }

  protected async refresh(): Promise<void> {
    const requestId = this.route.snapshot.paramMap.get("requestId") ?? "";
    await this.store.load(requestId);
  }

  protected async convert(): Promise<void> { await this.store.convert(); }
  protected async reject(): Promise<void> { await this.store.reject(this.reviewNote()); }

  protected setReviewNote(value: string): void {
    const lease = this.sessions.captureSessionLease();
    this.reviewNoteSnapshot.set({ lease, value: lease ? value : "" });
  }

  protected canReview(status: string): boolean {
    return status === "SUBMITTED" || status === "CHANGES_PROPOSED";
  }

  protected canConvert(status: string): boolean {
    return status === "SUBMITTED";
  }
}
