import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { NexaApiError } from "@nexa/api";
import { NexaButton, NexaLogo, NexaTextField } from "nexa-ui";
import { firstValueFrom } from "rxjs";
import { PortalBuyerEligibilityService } from "../../../customer-buyer-relationships/application/public-api";
import { PortalSessionStore } from "../../application/public-api";

@Component({
  selector: "portal-access-page",
  standalone: true,
  imports: [NexaButton, NexaLogo, NexaTextField],
  templateUrl: "./access-page.component.html",
  styleUrl: "./access-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessPageComponent {
  protected readonly session = inject(PortalSessionStore);
  private readonly buyerEligibility = inject(PortalBuyerEligibilityService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly workspaceSlug = signal("");
  protected readonly previewedWorkspaceSlug = signal("");
  protected readonly identifier = signal("");
  protected readonly password = signal("");
  protected readonly message = signal("");
  private readonly authenticating = signal(false);
  protected readonly workspaceReady = computed(
    () =>
      this.session.workspacePreviewState() === "recognized" &&
      this.previewedWorkspaceSlug() === this.workspaceSlug().trim(),
  );
  protected readonly previewBusy = computed(
    () => this.session.workspacePreviewState() === "checking",
  );
  protected readonly busy = computed(
    () => this.authenticating() || this.session.state().status === "signing-in",
  );

  protected async previewWorkspace(): Promise<void> {
    this.message.set("");
    const slug = this.workspaceSlug().trim();
    if (!slug) {
      this.message.set("Enter the workspace address to continue.");
      return;
    }
    try {
      const preview = await firstValueFrom(this.session.previewWorkspace(slug));
      const recognized =
        preview.recognized === true && preview.loginAvailable !== false;
      this.previewedWorkspaceSlug.set(recognized ? slug : "");
      if (!recognized)
        this.message.set(
          "This workspace is not available for sign-in. Check the address and try again.",
        );
    } catch {
      this.previewedWorkspaceSlug.set("");
      this.message.set(
        "This workspace is not available for sign-in. Check the address and try again.",
      );
    }
  }

  protected async authenticate(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    if (!this.workspaceReady()) {
      await this.previewWorkspace();
      return;
    }
    if (!this.identifier().trim() || !this.password()) {
      this.message.set("Enter your email and password to continue.");
      return;
    }

    this.message.set("");
    this.authenticating.set(true);
    try {
      await firstValueFrom(
        this.session.signIn({
          identifier: this.identifier().trim(),
          password: this.password(),
          workspaceSlug: this.workspaceSlug().trim(),
        }),
      );
      const eligibility = await firstValueFrom(
        this.buyerEligibility.checkCurrent(),
      );
      if (eligibility === "authorized") {
        await this.router.navigateByUrl(this.returnUrl());
      } else if (eligibility === "relationship-required") {
        await this.router.navigate(["/access/denied"]);
      } else if (eligibility === "unavailable") {
        this.message.set("Sign-in could not complete. Try again.");
      } else {
        this.message.set(
          "Those sign-in details could not be verified. Check them and try again.",
        );
      }
    } catch (error) {
      this.message.set(
        isTransient(error)
          ? "Sign-in could not complete. Try again."
          : "Those sign-in details could not be verified. Check them and try again.",
      );
    } finally {
      this.authenticating.set(false);
    }
  }

  private returnUrl(): string {
    const requested = this.route.snapshot.queryParamMap.get("returnUrl");
    return requested?.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/catalog";
  }
}

function isTransient(error: unknown): boolean {
  return (
    error instanceof NexaApiError &&
    ["network", "timeout", "server", "rate-limited", "http"].includes(
      error.kind,
    )
  );
}
