import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { PlatformShellComponent } from '../shell/platform-shell.component';
import { platformApiErrorMessage } from './platform-api-error-message';
import { PlatformSessionStore } from './platform-session.store';

@Component({
  selector: 'platform-session-shell',
  standalone: true,
  imports: [PlatformShellComponent],
  templateUrl: './platform-shell-session-wrapper.component.html',
  styleUrl: './platform-shell-session-wrapper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformShellSessionWrapperComponent {
  private readonly sessionStore = inject(PlatformSessionStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly session = computed(() => {
    const state = this.sessionStore.state();
    return state.status === 'authenticated' ? state.session : null;
  });
  readonly signOutError = signal('');

  signOut(): void {
    this.signOutError.set('');
    this.sessionStore.signOut().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => void this.router.navigateByUrl('/sign-in'),
      error: (error: unknown) => this.signOutError.set(platformApiErrorMessage(error, 'sign-out')),
    });
  }
}
