import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NexaAuthenticationApi } from '@nexa/api';
import { NexaButton, NexaSurface, NexaTextField } from 'nexa-ui';
import {
  INVALID_RESET_LINK_MESSAGE,
  passwordResetApiErrorMessage,
} from './password-reset-api-error-message';

type RecoveryMode = 'request' | 'reset' | 'invalid' | 'complete';

const RECOVERY_SURFACE = 'PLATFORM' as const;
const GENERIC_REQUEST_MESSAGE = 'If the account can receive a reset, instructions will be delivered.';
const REQUEST_STATUS_MESSAGE = 'Enter your email to request a recovery link.';

@Component({
  selector: 'web-recovery-page',
  standalone: true,
  imports: [NexaButton, NexaSurface, NexaTextField],
  templateUrl: './recovery-page.component.html',
  styleUrl: './recovery-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecoveryPageComponent {
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(NexaAuthenticationApi);

  readonly mode = signal<RecoveryMode>('request');
  readonly email = signal('');
  readonly newPassword = signal('');
  readonly confirmation = signal('');
  readonly busy = signal(false);
  readonly statusMessage = signal(REQUEST_STATUS_MESSAGE);
  readonly errorMessage = signal('');
  private readonly token = signal<string | null>(null);

  readonly passwordHint = computed(() => {
    const value = this.newPassword();
    if (!value) return '';
    if (value.length < 12) return 'Use at least 12 characters.';
    if (value.length > 128) return 'Use no more than 128 characters.';
    if ([...value].some((character) => /\p{Cc}/u.test(character))) return 'Control characters are not allowed.';
    return '';
  });

  constructor() {
    this.initializeFromUrl();
  }

  submitRequest(event: SubmitEvent): void {
    event.preventDefault();
    if (this.busy()) return;
    const email = this.email().trim();
    if (!this.isEmail(email)) {
      this.errorMessage.set('Enter a valid email address.');
      return;
    }

    this.errorMessage.set('');
    this.busy.set(true);
    this.api.requestPasswordReset({ email, surface: RECOVERY_SURFACE }).subscribe({
      next: () => this.finishRequest(),
      error: () => this.finishRequest(),
    });
  }

  submitReset(event: SubmitEvent): void {
    event.preventDefault();
    if (this.busy()) return;
    const token = this.token();
    const password = this.newPassword();
    if (!token) {
      this.mode.set('invalid');
      this.statusMessage.set(INVALID_RESET_LINK_MESSAGE);
      return;
    }
    if (!password) {
      this.errorMessage.set('Enter a new password.');
      return;
    }
    if (!this.confirmation()) {
      this.errorMessage.set('Confirm your new password.');
      return;
    }
    if (this.passwordHint()) {
      this.errorMessage.set(this.passwordHint());
      return;
    }
    if (password !== this.confirmation()) {
      this.errorMessage.set('Passwords must match.');
      return;
    }

    this.errorMessage.set('');
    this.busy.set(true);
    this.api.resetPassword({ token, newPassword: password }).subscribe({
      next: () => {
        this.busy.set(false);
        this.token.set(null);
        this.newPassword.set('');
        this.confirmation.set('');
        this.clearTokenFromUrl();
        this.mode.set('complete');
        this.statusMessage.set('Your password has been changed. You can sign in with the new password.');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.errorMessage.set(passwordResetApiErrorMessage(error));
      },
    });
  }

  private finishRequest(): void {
    this.busy.set(false);
    this.email.set('');
    this.statusMessage.set(GENERIC_REQUEST_MESSAGE);
  }

  private initializeFromUrl(): void {
    const view = this.document.defaultView;
    if (!view) return;

    const fragmentToken = new URLSearchParams(view.location.hash.replace(/^#/, '')).get('token')?.trim();
    const query = new URLSearchParams(view.location.search);
    const queryToken = query.get('token')?.trim();
    const token = fragmentToken || queryToken;
    if (token) {
      this.token.set(token);
      this.mode.set('reset');
      this.statusMessage.set('Choose a new password for your account.');
      this.clearTokenFromUrl();
      return;
    }

    if (query.has('token')) {
      this.mode.set('invalid');
      this.statusMessage.set(INVALID_RESET_LINK_MESSAGE);
      this.clearTokenFromUrl();
      return;
    }

    if (!isForgotPasswordRoute(view.location.pathname)) {
      this.mode.set('invalid');
      this.statusMessage.set(INVALID_RESET_LINK_MESSAGE);
    }
  }

  private clearTokenFromUrl(): void {
    const view = this.document.defaultView;
    if (!view) return;
    const query = new URLSearchParams(view.location.search);
    query.delete('token');
    const search = query.toString();
    const cleanPath = `${view.location.pathname}${search ? `?${search}` : ''}`;
    view.history.replaceState(null, this.document.title, cleanPath);
  }

  private isEmail(value: string): boolean {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}

function isForgotPasswordRoute(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, '');
  return normalizedPath === '/forgot-password' || normalizedPath.endsWith('/forgot-password');
}
