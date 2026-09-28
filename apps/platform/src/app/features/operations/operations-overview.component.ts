import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { NexaApiError, NexaLogisticsApi } from '@nexa/api';
import { NexaButton } from 'nexa-ui';
import { PlatformSessionStore } from '../../core/platform-session.store';
import { platformOperationsApiErrorMessage } from './platform-operations-api-error-message';
import { OperationsMetricViewModel, toOperationsMetricViewModels } from './operations-overview.models';

type OperationsOverviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly metrics: readonly OperationsMetricViewModel[] }
  | { readonly status: 'error'; readonly message: string; readonly retryable: boolean };

@Component({
  selector: 'platform-operations-overview',
  standalone: true,
  imports: [NexaButton],
  templateUrl: './operations-overview.component.html',
  styleUrl: './operations-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformOperationsOverviewComponent implements OnInit {
  private readonly api = inject(NexaLogisticsApi);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<OperationsOverviewState>({ status: 'loading' });

  ngOnInit(): void {
    this.load();
  }

  protected refresh(): void {
    this.load();
  }

  private load(): void {
    this.state.set({ status: 'loading' });
    this.api.getOperationsDashboard().pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (response) => {
        try {
          this.state.set({ status: 'ready', metrics: toOperationsMetricViewModels(response) });
        } catch (error: unknown) {
          this.state.set({
            status: 'error',
            message: platformOperationsApiErrorMessage(error),
            retryable: true,
          });
        }
      },
      error: (error: unknown) => {
        const unauthorized = error instanceof NexaApiError && error.kind === 'unauthenticated';
        if (unauthorized) {
          this.sessions.expireLocalSession();
          void this.router.navigate(['/sign-in'], {
            queryParams: { returnUrl: this.router.url },
          });
        }
        const forbidden = error instanceof NexaApiError && error.kind === 'forbidden';
        this.state.set({
          status: 'error',
          message: platformOperationsApiErrorMessage(error),
          retryable: !unauthorized && !forbidden,
        });
      },
    });
  }
}
