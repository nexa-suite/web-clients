import { Injectable, inject, signal } from "@angular/core";
import {
  NexaAccessTokenStore,
  NexaApiError,
  NexaAuthenticationApi,
} from "@nexa/api";
import type {
  AccessContextResponse,
  AuthenticationResponse,
  SelectAccessContextRequest,
  SessionResponse,
  SignInRequest,
  WorkspacePreviewResponse,
} from "@nexa/api";
import {
  Observable,
  ReplaySubject,
  catchError,
  defer,
  finalize,
  map,
  of,
  share,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from "rxjs";

export type PlatformSessionState =
  | { readonly status: "idle" | "loading" | "signing-in" | "unauthenticated" }
  | { readonly status: "authenticated"; readonly session: SessionResponse }
  | { readonly status: "signing-out"; readonly session: SessionResponse }
  | { readonly status: "selecting-context"; readonly session: SessionResponse }
  | { readonly status: "error"; readonly error: unknown };

export interface PlatformSignInCredentials {
  readonly identifier: string;
  readonly password: string;
  readonly workspaceSlug: string;
}

/** Non-secret correlation between one protected request and its authorized API scope. */
export interface PlatformSessionScope {
  readonly userId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly membershipId: string;
  readonly surface: "PLATFORM";
}

/** Captures the client session generation and server-issued context for stale-response fencing. */
export interface PlatformSessionLease {
  readonly epoch: number;
  readonly scope: PlatformSessionScope;
}

const SESSION_MUTATION_IN_PROGRESS =
  "A Platform session change is already in progress.";
const ACCESS_CONTEXT_INVALID = "ACCESS_CONTEXT_INVALID";

@Injectable({ providedIn: "root" })
export class PlatformSessionStore {
  private readonly authenticationApi = inject(NexaAuthenticationApi);
  private readonly accessTokens = inject(NexaAccessTokenStore);
  private operationVersion = 0;
  private sessionMutationVersion: number | null = null;
  private restorationRequest: Observable<PlatformSessionState> | null = null;

  readonly state = signal<PlatformSessionState>({ status: "idle" });

  previewWorkspace(
    workspaceSlug: string,
  ): Observable<WorkspacePreviewResponse> {
    return this.authenticationApi.previewWorkspace({ workspaceSlug });
  }

  restoreSession(): Observable<PlatformSessionState> {
    const current = this.state();
    if (current.status === "authenticated") return of(current);
    if (this.restorationRequest) return this.restorationRequest;
    if (current.status !== "idle") return of(current);

    const request = defer((): Observable<PlatformSessionState> => {
      const latest = this.state();
      if (latest.status !== "idle") return of(latest);

      const operationVersion = this.beginSessionMutation(true);
      if (operationVersion === null) return of(this.state());
      this.state.set({ status: "loading" });

      return this.authenticationApi.refresh().pipe(
        switchMap((response) => this.loadSession(response, operationVersion)),
        map((session) => {
          if (operationVersion !== this.operationVersion || session === null) {
            return this.state();
          }
          const authenticated: PlatformSessionState = {
            status: "authenticated",
            session,
          };
          this.state.set(authenticated);
          this.finishSessionMutation(operationVersion);
          return authenticated;
        }),
        catchError((error: unknown) => {
          if (operationVersion !== this.operationVersion)
            return of(this.state());
          this.accessTokens.clear();
          const failure: PlatformSessionState =
            error instanceof NexaApiError && error.kind === "unauthenticated"
              ? { status: "unauthenticated" }
              : { status: "error", error };
          this.state.set(failure);
          this.finishSessionMutation(operationVersion);
          return of(failure);
        }),
        finalize(() => this.finishSessionMutation(operationVersion)),
      );
    }).pipe(
      finalize(() => {
        if (this.restorationRequest === request) this.restorationRequest = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.restorationRequest = request;
    return request;
  }

  signIn(credentials: PlatformSignInCredentials): Observable<SessionResponse> {
    const request: SignInRequest = { ...credentials, surface: "PLATFORM" };
    return defer((): Observable<SessionResponse> => {
      const operationVersion = this.beginSessionMutation();
      if (operationVersion === null)
        return this.sessionMutationError<SessionResponse>();

      this.accessTokens.clear();
      this.state.set({ status: "signing-in" });

      return this.authenticationApi.signIn(request).pipe(
        switchMap((response) => this.loadSession(response, operationVersion)),
        map((session) => {
          if (session === null)
            throw new Error("The sign-in operation was superseded.");
          if (operationVersion === this.operationVersion) {
            this.state.set({ status: "authenticated", session });
            this.finishSessionMutation(operationVersion);
          }
          return session;
        }),
        catchError((error: unknown) => {
          if (operationVersion === this.operationVersion) {
            this.accessTokens.clear();
            this.state.set({ status: "unauthenticated" });
            this.finishSessionMutation(operationVersion);
          }
          return throwError(() => error);
        }),
        finalize(() => this.finishSessionMutation(operationVersion)),
      );
    }).pipe(shareSessionMutation());
  }

  signOut(): Observable<void> {
    return defer((): Observable<void> => {
      const operationVersion = this.beginSessionMutation();
      if (operationVersion === null) return this.sessionMutationError<void>();

      const current = this.state();
      if (!this.accessTokens.hasAccessToken()) {
        this.state.set({ status: "unauthenticated" });
        this.finishSessionMutation(operationVersion);
        return of(undefined);
      }

      const previousSession =
        current.status === "authenticated" || current.status === "signing-out"
          ? current.session
          : null;
      if (previousSession)
        this.state.set({ status: "signing-out", session: previousSession });

      return this.authenticationApi.signOut().pipe(
        tap(() => {
          if (operationVersion !== this.operationVersion) return;
          this.accessTokens.clear();
          this.state.set({ status: "unauthenticated" });
          this.finishSessionMutation(operationVersion);
        }),
        catchError((error: unknown) => {
          if (
            operationVersion === this.operationVersion &&
            error instanceof NexaApiError &&
            error.kind === "unauthenticated"
          ) {
            this.accessTokens.clear();
            this.state.set({ status: "unauthenticated" });
            this.finishSessionMutation(operationVersion);
            return of(undefined);
          }
          if (operationVersion === this.operationVersion && previousSession) {
            this.state.set({
              status: "authenticated",
              session: previousSession,
            });
            this.finishSessionMutation(operationVersion);
          }
          return throwError(() => error);
        }),
        finalize(() => this.finishSessionMutation(operationVersion)),
      );
    }).pipe(shareSessionMutation());
  }

  listAccessContexts(): Observable<readonly AccessContextResponse[]> {
    const lease = this.captureSessionLease();
    if (!lease) return this.invalidSessionScopeError();

    return this.authenticationApi.listAccessContexts().pipe(
      map((response) => {
        if (!this.isSessionLeaseCurrent(lease)) {
          throw new Error(
            "The access-context request was superseded by a session change.",
          );
        }
        if (
          !isRecord(response) ||
          !validAccessContexts(response["accessContexts"])
        ) {
          throw new Error(
            "The API returned an incomplete access-context list.",
          );
        }
        return response["accessContexts"];
      }),
      catchError((error: unknown) => {
        this.invalidateFromProtectedError(lease, error);
        return throwError(() => error);
      }),
    );
  }

  selectAccessContext(membershipId: string): Observable<SessionResponse> {
    return defer((): Observable<SessionResponse> => {
      if (this.sessionMutationVersion !== null)
        return this.sessionMutationError<SessionResponse>();
      const current = this.state();
      const lease = this.captureSessionLease();
      if (!lease || current.status !== "authenticated")
        return this.invalidSessionScopeError<SessionResponse>();
      const normalizedMembershipId = nonBlankString(membershipId);
      if (!normalizedMembershipId) {
        return throwError(
          () =>
            new Error(
              "A membership ID is required to select an access context.",
            ),
        );
      }

      const operationVersion = this.beginSessionMutation();
      if (operationVersion === null)
        return this.sessionMutationError<SessionResponse>();

      this.state.set({ status: "selecting-context", session: current.session });
      const request: SelectAccessContextRequest = {
        membershipId: normalizedMembershipId,
      };
      let selectionSucceeded = false;

      return this.authenticationApi.selectAccessContext(request).pipe(
        tap(() => {
          if (operationVersion === this.operationVersion) {
            selectionSucceeded = true;
            this.accessTokens.clear();
          }
        }),
        switchMap((response) => this.loadSession(response, operationVersion)),
        map((session) => {
          if (session === null)
            throw new Error("The access-context selection was superseded.");
          const selectedScope = platformSessionScope(session);
          if (
            !selectedScope ||
            selectedScope.membershipId !== request.membershipId ||
            selectedScope.userId !== lease.scope.userId
          ) {
            throw new Error(
              "The API returned a different access context than the one selected.",
            );
          }
          if (operationVersion === this.operationVersion) {
            this.state.set({ status: "authenticated", session });
            this.finishSessionMutation(operationVersion);
          }
          return session;
        }),
        catchError((error: unknown) => {
          if (operationVersion === this.operationVersion) {
            if (
              selectionSucceeded ||
              isUnauthenticated(error) ||
              isContextInvalid(error) ||
              !isDefinitiveSelectionRejection(error)
            ) {
              this.accessTokens.clear();
              this.state.set(
                isUnauthenticated(error)
                  ? { status: "unauthenticated" }
                  : { status: "error", error },
              );
            } else {
              this.state.set({
                status: "authenticated",
                session: current.session,
              });
            }
            this.finishSessionMutation(operationVersion);
          }
          return throwError(() => error);
        }),
        finalize(() => this.finishSessionMutation(operationVersion)),
      );
    }).pipe(shareSessionMutation());
  }

  captureSessionLease(): PlatformSessionLease | null {
    const current = this.state();
    if (this.sessionMutationVersion !== null) return null;
    if (current.status !== "authenticated") return null;
    const scope = platformSessionScope(current.session);
    return scope ? { epoch: this.operationVersion, scope } : null;
  }

  isSessionLeaseCurrent(lease: PlatformSessionLease): boolean {
    const current = this.state();
    if (
      this.sessionMutationVersion !== null ||
      lease.epoch !== this.operationVersion
    )
      return false;
    if (current.status !== "authenticated") return false;
    const scope = platformSessionScope(current.session);
    return scope !== null && sameScope(scope, lease.scope);
  }

  expireSessionIfCurrent(lease: PlatformSessionLease): boolean {
    if (!this.isSessionLeaseCurrent(lease)) return false;
    this.clearSession();
    return true;
  }

  invalidateContextIfCurrent(lease: PlatformSessionLease): boolean {
    if (!this.isSessionLeaseCurrent(lease)) return false;
    this.clearSession();
    return true;
  }

  private loadSession(
    response: AuthenticationResponse,
    operationVersion: number,
  ): Observable<SessionResponse | null> {
    const accessToken = isRecord(response)
      ? nonBlankString(response["accessToken"])
      : null;
    if (!accessToken) {
      return throwError(
        () =>
          new Error(
            "The API authentication response did not include an access token.",
          ),
      );
    }
    if (operationVersion !== this.operationVersion) return of(null);

    this.accessTokens.set(accessToken);
    return this.authenticationApi.getCurrentSession().pipe(
      map((session) => {
        if (!platformSessionScope(session)) {
          throw new Error(
            "The API session did not include a complete Platform access context.",
          );
        }
        return session;
      }),
    );
  }

  private invalidateFromProtectedError(
    lease: PlatformSessionLease,
    error: unknown,
  ): void {
    if (isUnauthenticated(error)) {
      this.expireSessionIfCurrent(lease);
    } else if (isContextInvalid(error)) {
      this.invalidateContextIfCurrent(lease);
    }
  }

  private clearSession(): void {
    this.operationVersion++;
    this.restorationRequest = null;
    this.accessTokens.clear();
    this.state.set({ status: "unauthenticated" });
  }

  private beginSessionMutation(
    preserveRestorationRequest = false,
  ): number | null {
    if (this.sessionMutationVersion !== null) return null;
    const operationVersion = ++this.operationVersion;
    this.sessionMutationVersion = operationVersion;
    if (!preserveRestorationRequest) this.restorationRequest = null;
    return operationVersion;
  }

  private finishSessionMutation(operationVersion: number): void {
    if (this.sessionMutationVersion !== operationVersion) return;
    this.sessionMutationVersion = null;
    const current = this.state();
    if (current.status === "authenticated") this.state.set({ ...current });
  }

  private sessionMutationError<T>(): Observable<T> {
    return throwError(() => new Error(SESSION_MUTATION_IN_PROGRESS));
  }

  private invalidSessionScopeError<T>(): Observable<T> {
    return throwError(
      () => new Error("A complete authenticated Platform context is required."),
    );
  }
}

function platformSessionScope(
  session: SessionResponse | null | undefined,
): PlatformSessionScope | null {
  if (!isRecord(session)) return null;
  const user = isRecord(session["user"]) ? session["user"] : null;
  const tenant = isRecord(session["tenant"]) ? session["tenant"] : null;
  const workspace = isRecord(session["workspace"])
    ? session["workspace"]
    : null;
  const membership = isRecord(session["membership"])
    ? session["membership"]
    : null;
  const userId = nonBlankString(user?.["userId"]);
  const tenantId = nonBlankString(tenant?.["tenantId"]);
  const workspaceId = nonBlankString(workspace?.["workspaceId"]);
  const membershipId = nonBlankString(membership?.["membershipId"]);
  if (
    session["surface"] !== "PLATFORM" ||
    !userId ||
    !tenantId ||
    !workspaceId ||
    !membershipId
  )
    return null;
  return { userId, tenantId, workspaceId, membershipId, surface: "PLATFORM" };
}

function validAccessContexts(
  contexts: unknown,
): contexts is readonly AccessContextResponse[] {
  if (!Array.isArray(contexts)) return false;
  const membershipIds = new Set<string>();
  return contexts.every((context) => {
    if (!isRecord(context)) return false;
    const membershipId = nonBlankString(context["membershipId"]);
    const valid =
      membershipId !== null &&
      nonBlankString(context["tenantId"]) !== null &&
      nonBlankString(context["tenantName"]) !== null &&
      nonBlankString(context["tenantSlug"]) !== null &&
      nonBlankString(context["workspaceId"]) !== null &&
      nonBlankString(context["workspaceName"]) !== null &&
      nonBlankString(context["workspaceSlug"]) !== null;
    if (!valid || membershipIds.has(membershipId!)) return false;
    membershipIds.add(membershipId!);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlankString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function sameScope(
  left: PlatformSessionScope,
  right: PlatformSessionScope,
): boolean {
  return (
    left.userId === right.userId &&
    left.tenantId === right.tenantId &&
    left.workspaceId === right.workspaceId &&
    left.membershipId === right.membershipId &&
    left.surface === right.surface
  );
}

function shareSessionMutation<T>() {
  return share<T>({
    connector: () => new ReplaySubject<T>(1),
    resetOnComplete: false,
    resetOnError: false,
    resetOnRefCountZero: false,
  });
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof NexaApiError && error.kind === "unauthenticated";
}

function isContextInvalid(error: unknown): boolean {
  return (
    error instanceof NexaApiError &&
    error.kind === "forbidden" &&
    error.problem?.code === ACCESS_CONTEXT_INVALID
  );
}

function isDefinitiveSelectionRejection(error: unknown): boolean {
  if (!(error instanceof NexaApiError)) return false;
  const code = error.problem?.code;
  if (error.status === 400) return code === "INVALID_REQUEST";
  if (error.status === 403) {
    return (
      code === "ORIGIN_NOT_ALLOWED" ||
      code === "NATIVE_CLIENT_REQUIRED" ||
      code === "FORBIDDEN" ||
      code === "PERMISSION_DENIED" ||
      code === "WORKSPACE_ACCESS_DENIED" ||
      code === "SURFACE_ACCESS_DENIED"
    );
  }
  return error.status === 409 && code === "ACCESS_CONTEXT_SELECTION_REJECTED";
}
