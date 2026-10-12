import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NexaApiError } from "@nexa/api";
import type { AccessContextResponse, SessionResponse } from "@nexa/api";
import { NexaButton, NexaSurface } from "nexa-ui";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "../../application/platform-session.store";
import { presentApiRoles } from "./platform-role-presentation";

type CollectionPresentation<T> =
  | { readonly status: "not-supplied" }
  | { readonly status: "empty" }
  | { readonly status: "provided"; readonly values: readonly T[] };

type AccessContextListState =
  | { readonly status: "idle" | "loading" }
  | {
      readonly status: "ready";
      readonly contexts: readonly AccessContextResponse[];
    }
  | { readonly status: "error"; readonly message: string };

@Component({
  selector: "platform-active-context",
  standalone: true,
  imports: [NexaButton, NexaSurface],
  templateUrl: "./platform-active-context.component.html",
  styleUrl: "./platform-active-context.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformActiveContextComponent {
  private readonly sessionStore = inject(PlatformSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private contextRequestVersion = 0;
  private loadedSessionEpoch: number | null = null;

  readonly accessContextList = signal<AccessContextListState>({
    status: "idle",
  });
  readonly selectedMembershipId = signal("");
  readonly selectionError = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.sessionStore.state().status !== "authenticated") return;
      const lease = this.sessionStore.captureSessionLease();
      if (!lease || lease.epoch === this.loadedSessionEpoch) return;
      this.loadedSessionEpoch = lease.epoch;
      this.loadAccessContexts(lease);
    });
  }

  readonly session = computed(() => {
    const state = this.sessionStore.state();
    return state.status === "authenticated" ||
      state.status === "selecting-context"
      ? state.session
      : null;
  });

  readonly apiRoles = computed<
    CollectionPresentation<ReturnType<typeof presentApiRoles>[number]>
  >(() => {
    const roles = this.session()?.membership?.roles;
    if (roles === undefined) return { status: "not-supplied" };
    if (roles.length === 0) return { status: "empty" };
    return { status: "provided", values: presentApiRoles(roles) };
  });

  readonly apiPermissions = computed<CollectionPresentation<string>>(() => {
    const permissions = this.session()?.membership?.permissions;
    if (permissions === undefined) return { status: "not-supplied" };
    if (permissions.length === 0) return { status: "empty" };
    return { status: "provided", values: permissions };
  });

  readonly sessionStatus = computed(() => this.sessionStore.state().status);

  readonly selectionPending = computed(
    () => this.sessionStore.state().status === "selecting-context",
  );

  readonly canSelectContext = computed(() => {
    if (this.sessionStore.state().status !== "authenticated") return false;
    const session = this.session();
    const list = this.accessContextList();
    const selectedMembershipId = this.selectedMembershipId();
    if (!session || list.status !== "ready" || !selectedMembershipId)
      return false;
    return list.contexts.some(
      (context) => context.membershipId === selectedMembershipId,
    );
  });

  apiValue(value: string | null | undefined): string {
    return value?.trim() || "Not supplied by the API";
  }

  selectMembership(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.selectionError.set(null);
    this.selectedMembershipId.set(target.value);
  }

  switchContext(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.canSelectContext()) return;

    const membershipId = this.selectedMembershipId();
    this.selectionError.set(null);
    this.sessionStore
      .selectAccessContext(membershipId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.selectedMembershipId.set(session.membership?.membershipId ?? "");
        },
        error: (error: unknown) => {
          this.selectionError.set(
            accessContextApiErrorMessage(error, "selection"),
          );
        },
      });
  }

  retryAccessContexts(): void {
    if (this.sessionStore.state().status !== "authenticated") return;
    const lease = this.sessionStore.captureSessionLease();
    if (!lease) return;
    this.selectionError.set(null);
    this.loadAccessContexts(lease, true);
  }

  private loadAccessContexts(
    lease: PlatformSessionLease,
    resetSelection = false,
  ): void {
    const requestVersion = ++this.contextRequestVersion;
    this.accessContextList.set({ status: "loading" });

    this.sessionStore
      .listAccessContexts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (contexts) => {
          if (!this.isCurrentContextRequest(requestVersion, lease)) return;
          this.accessContextList.set({ status: "ready", contexts });
          const currentMembershipId =
            this.session()?.membership?.membershipId ?? "";
          const selectedMembershipId = resetSelection
            ? currentMembershipId
            : this.selectedMembershipId() || currentMembershipId;
          const selectedIsAvailable = contexts.some(
            (context) => context.membershipId === selectedMembershipId,
          );
          this.selectedMembershipId.set(
            selectedIsAvailable ? selectedMembershipId : "",
          );
        },
        error: (error: unknown) => {
          if (!this.isCurrentContextRequest(requestVersion, lease)) return;
          this.accessContextList.set({
            status: "error",
            message: accessContextApiErrorMessage(error, "list"),
          });
        },
      });
  }

  private isCurrentContextRequest(
    requestVersion: number,
    lease: PlatformSessionLease,
  ): boolean {
    return (
      requestVersion === this.contextRequestVersion &&
      this.sessionStore.isSessionLeaseCurrent(lease)
    );
  }
}

function accessContextApiErrorMessage(
  error: unknown,
  operation: "list" | "selection",
): string {
  if (error instanceof NexaApiError) {
    if (error.problem?.code === "ACCESS_CONTEXT_SELECTION_REJECTED") {
      return "The API could not select that context. Refresh the eligible contexts and choose an available one.";
    }
    if (
      error.problem?.code === "ACCESS_CONTEXT_INVALID" ||
      error.kind === "unauthenticated"
    ) {
      return "The current access context could not be verified. Sign in again to continue.";
    }
    if (error.kind === "network" || error.kind === "timeout") {
      return "The API could not be reached. Check your connection and try again.";
    }
    if (error.kind === "forbidden") {
      return "The API did not allow this access-context request.";
    }
  }

  return operation === "list"
    ? "Eligible business contexts could not be loaded. Try again."
    : "The selected business context could not be confirmed. Sign in again to verify your current access.";
}
