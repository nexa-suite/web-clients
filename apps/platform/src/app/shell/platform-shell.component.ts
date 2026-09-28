import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { SessionResponse } from '@nexa/api';
import { NexaButton, NexaLogo } from 'nexa-ui';

@Component({
  selector: 'platform-shell',
  standalone: true,
  imports: [NexaButton, NexaLogo, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './platform-shell.component.html',
  styleUrl: './platform-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformShellComponent {
  private readonly operationsOverviewPermissions = new Set([
    'logistics.read',
    'dispatch.read',
    'logistics.analytics.read',
    'logistics:read',
  ]);

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

    return contextParts.length > 0 ? contextParts.join(' · ') : null;
  }

  protected get canViewOperationsOverview(): boolean {
    return this.session?.membership?.permissions?.some((permission) =>
      this.operationsOverviewPermissions.has(permission),
    ) ?? false;
  }

  private namedContextLabel(name: string | undefined, slug: string | undefined): string | null {
    if (name && slug && name !== slug) return `${name} (${slug})`;
    return name || slug || null;
  }
}
