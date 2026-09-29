import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NexaButton, NexaLogo } from 'nexa-ui';
import { PortalSessionStore } from './portal-session.store';

@Component({
  selector: 'portal-access-status-page',
  standalone: true,
  imports: [NexaButton, NexaLogo],
  template: `
    <main class="status-page">
      <section class="status-card" aria-labelledby="status-heading">
        <nexa-logo alt="Nexa" />
        <h1 id="status-heading">{{ title }}</h1>
        <p>{{ message }}</p>
        <nexa-button variant="secondary" (click)="returnToAccess()">Return to sign in</nexa-button>
      </section>
    </main>
  `,
  styles: `
    :host { display:block; min-height:100dvh; }
    .status-page { display:grid; min-height:100dvh; place-items:center; padding:var(--nexa-space-5); background:var(--nexa-surface-page); }
    .status-card { display:grid; justify-items:start; gap:var(--nexa-space-4); width:min(100%,560px); padding:var(--nexa-panel-padding); border:1px solid var(--nexa-color-border-default); border-radius:var(--nexa-radius-panel); background:var(--nexa-surface-card); }
    nexa-logo { width:140px; }
    h1,p { margin:0; }
    h1 { font:700 24px/1.2 var(--nexa-font-family-display); }
    p { color:var(--nexa-color-text-secondary); line-height:1.55; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessStatusPageComponent {
  private readonly router = inject(Router);
  private readonly session = inject(PortalSessionStore);
  protected readonly title: string;
  protected readonly message: string;

  constructor() {
    const denied = this.router.url.startsWith('/access/denied');
    this.title = denied ? 'Buyer access is not available' : 'Workspace access is temporarily unavailable';
    this.message = denied
      ? 'This sign-in does not have an active buyer relationship for the selected workspace. Contact your supplier if you need access.'
      : 'Your session could not be checked. Try again when the service is available.';
  }

  protected async returnToAccess(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/access']);
  }
}
