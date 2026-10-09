import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  viewChild,
} from "@angular/core";
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { NexaButton, NexaLogo } from "nexa-ui";
import { firstValueFrom } from "rxjs";
import { PortalBuyerEligibilityService } from "../contexts/customer-buyer-relationships/application/public-api";
import { PortalSessionStore } from "../contexts/tenant-access-governance/application/public-api";

@Component({
  selector: "portal-shell",
  standalone: true,
  imports: [NexaButton, NexaLogo, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./portal-shell.component.html",
  styleUrl: "./portal-shell.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalShellComponent {
  protected readonly session = inject(PortalSessionStore);
  private readonly buyerEligibility = inject(PortalBuyerEligibilityService);
  private readonly router = inject(Router);
  protected readonly canViewDeliveries = computed(() => {
    const current = this.session.state();
    return (
      current.status === "authenticated" &&
      (current.session.membership?.permissions ?? []).includes(
        "buyer.tracking.read",
      )
    );
  });
  private readonly mainContent =
    viewChild.required<ElementRef<HTMLElement>>("mainContent");
  protected readonly accountName = computed(() => {
    const account = this.buyerEligibility.currentAccount();
    const person = this.session.session()?.user;
    return (
      account?.commercialName ||
      account?.businessName ||
      person?.displayName ||
      "Buyer"
    );
  });

  protected skipToMainContent(event: MouseEvent): void {
    event.preventDefault();
    this.mainContent().nativeElement.focus();
  }

  protected async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.session.signOut());
      await this.router.navigate(["/access"]);
    } catch {
      // The session store preserves a valid local session when sign-out is unconfirmed.
    }
  }
}
