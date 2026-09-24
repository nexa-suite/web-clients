import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NexaButton, NexaLogo, NexaStatusChip, NexaTextField } from 'nexa-ui';
import type { WorkspacePreviewResponse } from '@nexa/api';
import { platformApiErrorMessage } from '../../core/platform-api-error-message';
import { PlatformSessionStore } from '../../core/platform-session.store';

@Component({
  selector: 'platform-sign-in-page',
  standalone: true,
  imports: [NexaButton, NexaLogo, NexaStatusChip, NexaTextField],
  templateUrl: './sign-in-page.component.html',
  styleUrl: './sign-in-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInPageComponent {
  private readonly sessionStore = inject(PlatformSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly workspaceSlug = signal('');
  readonly identifier = signal('');
  readonly password = signal('');
  readonly preview = signal<WorkspacePreviewResponse | null>(null);
  readonly previewedSlug = signal<string | null>(null);
  readonly previewing = signal(false);
  readonly signingIn = signal(false);
  readonly workspaceError = signal('');
  readonly requestError = signal('');
  readonly statusMessage = signal('Enter a workspace slug to preview the context returned by the API.');
  private previewRequestVersion = 0;
  readonly canSignIn = computed(() => {
    const preview = this.preview();
    return preview?.recognized === true
      && preview.loginAvailable === true
      && this.previewedSlug() === this.workspaceSlug().trim();
  });

  private readonly redirectForRestoredSession = effect(() => {
    if (this.sessionStore.state().status === 'authenticated') {
      void this.router.navigateByUrl(this.returnUrl());
    }
  });

  setWorkspaceSlug(value: string): void {
    this.previewRequestVersion += 1;
    this.workspaceSlug.set(value);
    this.preview.set(null);
    this.previewedSlug.set(null);
    this.workspaceError.set('');
    this.requestError.set('');
    this.previewing.set(false);
    this.statusMessage.set('Preview the workspace before entering your credentials.');
  }

  previewWorkspace(): void {
    const workspaceSlug = this.workspaceSlug().trim();
    if (!/^[a-zA-Z0-9-]{3,80}$/.test(workspaceSlug)) {
      this.workspaceError.set('Enter a workspace slug with 3 to 80 letters, numbers, or hyphens.');
      this.statusMessage.set('The workspace slug needs correction.');
      return;
    }

    this.workspaceError.set('');
    this.requestError.set('');
    this.preview.set(null);
    const requestVersion = ++this.previewRequestVersion;
    this.previewedSlug.set(workspaceSlug);
    this.previewing.set(true);
    this.statusMessage.set('Checking the workspace with the API.');

    this.sessionStore.previewWorkspace(workspaceSlug).subscribe({
      next: (preview) => {
        if (requestVersion !== this.previewRequestVersion) return;
        this.preview.set(preview);
        this.previewing.set(false);
        this.statusMessage.set(preview.recognized && preview.loginAvailable
          ? 'Workspace preview returned by the API. Enter your work identity to continue.'
          : 'The API did not make this workspace available for sign-in.');
      },
      error: (error: unknown) => {
        if (requestVersion !== this.previewRequestVersion) return;
        this.previewing.set(false);
        this.previewedSlug.set(null);
        this.requestError.set(platformApiErrorMessage(error, 'preview'));
        this.statusMessage.set('Workspace preview could not be completed.');
      },
    });
  }

  signIn(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.canSignIn()) return;

    const identifier = this.identifier().trim();
    const password = this.password();
    if (!identifier || !password.trim()) {
      this.requestError.set('Enter your work identity and password.');
      return;
    }

    this.requestError.set('');
    this.signingIn.set(true);
    this.sessionStore.signIn({
      identifier,
      password,
      workspaceSlug: this.previewedSlug() ?? this.workspaceSlug().trim(),
    }).subscribe({
      next: () => {
        this.password.set('');
        this.signingIn.set(false);
        void this.router.navigateByUrl(this.returnUrl());
      },
      error: (error: unknown) => {
        this.signingIn.set(false);
        this.requestError.set(platformApiErrorMessage(error, 'sign-in'));
        this.statusMessage.set('Sign in could not be completed.');
      },
    });
  }

  private returnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl?.startsWith('/')
      && !returnUrl.startsWith('//')
      && !returnUrl.startsWith('/sign-in')
      ? returnUrl
      : '/';
  }
}
