import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NexaButton, NexaLogo, NexaTextField } from 'nexa-ui';
import { PortalSessionStore } from './portal-session.store';

@Component({
  selector: 'portal-access-page',
  standalone: true,
  imports: [NexaButton, NexaLogo, NexaTextField],
  templateUrl: './access-page.component.html',
  styleUrl: './access-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessPageComponent {
  protected readonly session = inject(PortalSessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly workspaceSlug = signal('');
  protected readonly previewedWorkspaceSlug = signal('');
  protected readonly identifier = signal('');
  protected readonly password = signal('');
  protected readonly message = signal('');
  protected readonly workspaceReady = computed(() =>
    this.session.workspacePreviewState() === 'recognized' &&
    this.previewedWorkspaceSlug() === this.workspaceSlug().trim(),
  );
  protected readonly previewBusy = computed(() => this.session.workspacePreviewState() === 'checking');

  protected async previewWorkspace(): Promise<void> {
    this.message.set('');
    const slug = this.workspaceSlug().trim();
    if (!slug) {
      this.message.set('Enter the workspace address to continue.');
      return;
    }
    const recognized = await this.session.previewWorkspace(slug);
    this.previewedWorkspaceSlug.set(recognized ? slug : '');
    if (!recognized) this.message.set('This workspace is not available for sign-in. Check the address and try again.');
  }

  protected async authenticate(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!this.workspaceReady()) {
      await this.previewWorkspace();
      return;
    }
    if (!this.identifier().trim() || !this.password()) {
      this.message.set('Enter your email and password to continue.');
      return;
    }

    this.message.set('');
    const state = await this.session.signIn({
      identifier: this.identifier().trim(),
      password: this.password(),
      workspaceSlug: this.workspaceSlug().trim(),
      surface: 'PORTAL',
    });
    if (state === 'authorized') {
      await this.router.navigateByUrl(this.returnUrl());
    } else if (state === 'relationship-required') {
      await this.router.navigate(['/access/denied']);
    } else {
      this.message.set(state === 'unavailable'
        ? 'Sign-in could not complete. Try again.'
        : 'Those sign-in details could not be verified. Check them and try again.');
    }
  }

  private returnUrl(): string {
    const requested = this.route.snapshot.queryParamMap.get('returnUrl');
    return requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/catalog';
  }
}
