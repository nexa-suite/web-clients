import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NexaButton, NexaLogo } from 'nexa-ui';
import { PortalSessionStore } from '../features/access/portal-session.store';

@Component({
  selector: 'portal-shell',
  standalone: true,
  imports: [NexaButton, NexaLogo, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './portal-shell.component.html',
  styleUrl: './portal-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalShellComponent {
  protected readonly session = inject(PortalSessionStore);
  private readonly router = inject(Router);
  private readonly mainContent = viewChild.required<ElementRef<HTMLElement>>('mainContent');
  protected readonly accountName = computed(() => {
    const account = this.session.buyerAccount();
    const person = this.session.session()?.user;
    return account?.commercialName || account?.businessName || person?.displayName || 'Buyer';
  });

  protected skipToMainContent(event: MouseEvent): void {
    event.preventDefault();
    this.mainContent().nativeElement.focus();
  }

  protected async signOut(): Promise<void> {
    if (await this.session.signOut()) {
      await this.router.navigate(['/access']);
    }
  }
}
