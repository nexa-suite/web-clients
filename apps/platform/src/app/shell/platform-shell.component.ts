import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import type { SessionResponse } from "@nexa/api";
import { NexaButton, NexaLogo } from "nexa-ui";
import {
  canAccessPlatformFeature,
  PLATFORM_ACCESS_RULES,
} from "../core/platform-access-policy";

@Component({
  selector: "platform-shell",
  standalone: true,
  imports: [NexaButton, NexaLogo, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./platform-shell.component.html",
  styleUrl: "./platform-shell.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformShellComponent {
  @Input() session: SessionResponse | null = null;

  @Output() readonly signOut = new EventEmitter<void>();

  protected get identityLabel(): string | null {
    const displayName = this.session?.user?.displayName?.trim();
    const email = this.session?.user?.email?.trim();

    return displayName || email || null;
  }

  protected get contextLabel(): string | null {
    const tenantName = this.session?.tenant?.tenantName?.trim();
    const tenantSlug = this.session?.tenant?.tenantSlug?.trim();
    const workspaceName = this.session?.workspace?.workspaceName?.trim();
    const workspaceSlug = this.session?.workspace?.workspaceSlug?.trim();
    const contextParts: string[] = [];

    const tenantLabel = this.namedContextLabel(tenantName, tenantSlug);
    const workspaceLabel = this.namedContextLabel(workspaceName, workspaceSlug);
    if (tenantLabel) contextParts.push(`Tenant: ${tenantLabel}`);
    if (workspaceLabel) contextParts.push(`Workspace: ${workspaceLabel}`);

    return contextParts.length > 0 ? contextParts.join(" · ") : null;
  }

  protected get canViewOperationsOverview(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.operationsOverview,
    );
  }

  protected get canViewSalesCommitment(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.purchaseRequests,
    );
  }

  protected get canViewFulfillment(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.fulfillment,
    );
  }

  protected get canViewDocuments(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.documents,
    );
  }

  protected get canGenerateOrderSummary(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.orderSummaryGeneration,
    );
  }
  protected get canConfigureCredit(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.creditConfiguration,
    );
  }
  protected get canManageWalletRefunds(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.walletRefunds,
    );
  }
  protected get canViewTenantAccess(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.workforceAccess,
    );
  }
  protected get canViewTenantRoles(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.rolesAndPermissions,
    );
  }

  protected get canManageSupportConsents(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.supportConsent,
    );
  }

  protected get canManageWarehouseAccessGrants(): boolean {
    return canAccessPlatformFeature(
      this.session,
      PLATFORM_ACCESS_RULES.warehouseAccess,
    );
  }

  private namedContextLabel(
    name: string | undefined,
    slug: string | undefined,
  ): string | null {
    if (name && slug && name !== slug) return `${name} (${slug})`;
    return name || slug || null;
  }
}
