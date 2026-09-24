import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { SessionResponse } from '@nexa/api';
import { NexaButton, NexaLogo } from 'nexa-ui';

@Component({
  selector: 'platform-shell',
  standalone: true,
  imports: [NexaButton, NexaLogo, RouterOutlet],
  templateUrl: './platform-shell.component.html',
  styleUrl: './platform-shell.component.scss',
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
    const tenantSlug = this.session?.tenant?.tenantSlug?.trim();
    const workspaceSlug = this.session?.workspace?.workspaceSlug?.trim();
    const contextParts: string[] = [];

    if (tenantSlug) contextParts.push(`Tenant: ${tenantSlug}`);
    if (workspaceSlug) contextParts.push(`Workspace: ${workspaceSlug}`);

    return contextParts.length > 0 ? contextParts.join(' · ') : null;
  }
}
