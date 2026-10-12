import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { NexaApiError, NexaLogisticsApi } from "@nexa/api";
import { NexaButton } from "nexa-ui";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "../../contexts/tenant-access-governance/application/public-api";
import { platformOperationsApiErrorMessage } from "./platform-operations-api-error-message";
import {
  OperationsMetricViewModel,
  toOperationsMetricViewModels,
} from "./operations-overview.models";

type OperationsOverviewState =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly metrics: readonly OperationsMetricViewModel[];
    }
  | {
      readonly status: "error";
      readonly message: string;
      readonly retryable: boolean;
    };

@Component({
  selector: "platform-operations-overview",
  standalone: true,
  imports: [NexaButton],
  templateUrl: "./operations-overview.component.html",
  styleUrl: "./operations-overview.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformOperationsOverviewComponent implements OnInit {
  private readonly api = inject(NexaLogisticsApi);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private requestVersion = 0;
  private readonly stateSnapshot = signal<{
    readonly value: OperationsOverviewState;
    readonly lease: PlatformSessionLease | null;
  }>({ value: { status: "loading" }, lease: null });

  protected readonly state = computed(() => {
    const snapshot = this.stateSnapshot();
    if (
      snapshot.lease &&
      !this.sessions.isSessionLeaseCurrent(snapshot.lease)
    ) {
      return {
        status: "error" as const,
        message:
          "The active session changed before this overview could be updated.",
        retryable: this.sessions.captureSessionLease() !== null,
      };
    }
    return snapshot.value;
  });

  ngOnInit(): void {
    this.load();
  }

  protected refresh(): void {
    this.load();
  }

  private load(): void {
    const requestVersion = ++this.requestVersion;
    const lease = this.sessions.captureSessionLease();
    if (!lease) {
      this.stateSnapshot.set({
        value: {
          status: "error",
          message:
            "A complete current Platform context is required to load this overview.",
          retryable: false,
        },
        lease: null,
      });
      return;
    }

    this.stateSnapshot.set({ value: { status: "loading" }, lease });
    this.api
      .getOperationsDashboard()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (!this.isCurrentRequest(requestVersion, lease)) return;
          try {
            this.stateSnapshot.set({
              value: {
                status: "ready",
                metrics: toOperationsMetricViewModels(response),
              },
              lease,
            });
          } catch (error: unknown) {
            this.stateSnapshot.set({
              value: {
                status: "error",
                message: platformOperationsApiErrorMessage(error),
                retryable: true,
              },
              lease,
            });
          }
        },
        error: (error: unknown) => {
          if (!this.isCurrentRequest(requestVersion, lease)) return;
          const unauthorized =
            error instanceof NexaApiError && error.kind === "unauthenticated";
          if (unauthorized) {
            this.sessions.expireSessionIfCurrent(lease);
            void this.router.navigate(["/sign-in"], {
              queryParams: { returnUrl: this.router.url },
            });
            return;
          }
          const contextInvalid =
            error instanceof NexaApiError &&
            error.kind === "forbidden" &&
            error.problem?.code === "ACCESS_CONTEXT_INVALID";
          if (contextInvalid) {
            this.sessions.invalidateContextIfCurrent(lease);
            void this.router.navigate(["/sign-in"], {
              queryParams: { returnUrl: this.router.url },
            });
            return;
          }
          const forbidden =
            error instanceof NexaApiError && error.kind === "forbidden";
          this.stateSnapshot.set({
            value: {
              status: "error",
              message: platformOperationsApiErrorMessage(error),
              retryable: !unauthorized && !forbidden,
            },
            lease,
          });
        },
      });
  }

  private isCurrentRequest(
    requestVersion: number,
    lease: PlatformSessionLease,
  ): boolean {
    if (requestVersion !== this.requestVersion) return false;
    if (this.sessions.isSessionLeaseCurrent(lease)) return true;
    this.stateSnapshot.set({
      value: {
        status: "error",
        message:
          "The active session changed before this overview could be updated.",
        retryable: this.sessions.captureSessionLease() !== null,
      },
      lease,
    });
    return false;
  }
}
