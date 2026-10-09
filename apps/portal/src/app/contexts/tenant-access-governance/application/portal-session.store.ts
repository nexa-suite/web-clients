import { computed, inject, Injectable, signal } from "@angular/core";
import {
  NexaAccessTokenStore,
  NexaApiError,
  NexaAuthenticationApi,
} from "@nexa/api";
import type {
  AuthenticationResponse,
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
  throwError,
} from "rxjs";

export type PortalSessionState =
  | {
      readonly status:
        | "idle"
        | "loading"
        | "signing-in"
        | "anonymous"
        | "invalidated";
    }
  | { readonly status: "authenticated"; readonly session: SessionResponse }
  | { readonly status: "signing-out"; readonly session: SessionResponse }
  | { readonly status: "error"; readonly error: unknown };

export type WorkspacePreviewState =
  | "idle"
  | "checking"
  | "recognized"
  | "unavailable"
  | "error";

export interface PortalSessionScope {
  readonly userId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly membershipId: string;
  readonly surface: "PORTAL";
}

/** Captures the client session generation and server-issued scope for stale-response fencing. */
export interface PortalSessionLease {
  readonly epoch: number;
  readonly scope: PortalSessionScope;
}

const SESSION_MUTATION_IN_PROGRESS =
  "A Portal session change is already in progress.";
const ACCESS_CONTEXT_INVALID = "ACCESS_CONTEXT_INVALID";

@Injectable({ providedIn: "root" })
export class PortalSessionStore {
  private readonly authenticationApi = inject(NexaAuthenticationApi);
  private readonly accessTokens = inject(NexaAccessTokenStore);
  private operationVersion = 0;
  private sessionMutationVersion: number | null = null;
  private restorationRequest: Observable<PortalSessionState> | null = null;
  private previewVersion = 0;

  readonly state = signal<PortalSessionState>({ status: "idle" });
  readonly session = computed(() => {
    const current = this.state();
    return current.status === "authenticated" ||
      current.status === "signing-out"
      ? current.session
      : null;
  });
  readonly workspacePreview = signal<WorkspacePreviewResponse | null>(null);
  readonly workspacePreviewState = signal<WorkspacePreviewState>("idle");
  readonly signOutError = signal("");

  previewWorkspace(
    workspaceSlug: string,
  ): Observable<WorkspacePreviewResponse> {
    const version = ++this.previewVersion;
    const normalizedSlug = nonBlankString(workspaceSlug);
    if (!normalizedSlug) {
      this.workspacePreview.set(null);
      this.workspacePreviewState.set("unavailable");
      return throwError(() => new Error("A workspace address is required."));
    }

    this.workspacePreview.set(null);
    this.workspacePreviewState.set("checking");
    return this.authenticationApi
      .previewWorkspace({ workspaceSlug: normalizedSlug })
      .pipe(
        map((response) => {
          if (version === this.previewVersion) {
            this.workspacePreview.set(response);
            const recognized =
              response.recognized === true && response.loginAvailable !== false;
            this.workspacePreviewState.set(
              recognized ? "recognized" : "unavailable",
            );
          }
          return response;
        }),
        catchError((error: unknown) => {
          if (version === this.previewVersion) {
            this.workspacePreview.set(null);
            this.workspacePreviewState.set("error");
          }
          return throwError(() => error);
        }),
      );
  }

  restoreSession(): Observable<PortalSessionState> {
    const current = this.state();
    if (current.status === "authenticated") return of(current);
    if (this.restorationRequest) return this.restorationRequest;
    if (this.sessionMutationVersion !== null) return of(current);

    const request = defer((): Observable<PortalSessionState> => {
      const latest = this.state();
      if (
        latest.status === "authenticated" ||
        this.sessionMutationVersion !== null
      )
        return of(latest);

      const operationVersion = this.beginSessionMutation(true);
      if (operationVersion === null) return of(this.state());
      this.signOutError.set("");
      this.state.set({ status: "loading" });

      const currentSession = this.accessTokens.hasAccessToken()
        ? this.loadExistingSession(operationVersion)
        : this.refreshAndLoadSession(operationVersion);

      return currentSession.pipe(
        map((session) => {
          if (operationVersion !== this.operationVersion || session === null)
            return this.state();
          const authenticated: PortalSessionState = {
            status: "authenticated",
            session,
          };
          this.finishSessionMutation(operationVersion);
          this.state.set(authenticated);
          return authenticated;
        }),
        catchError((error: unknown) => {
          if (operationVersion !== this.operationVersion)
            return of(this.state());
          this.accessTokens.clear();
          const failure = isUnauthenticated(error)
            ? { status: "anonymous" as const }
            : isContextInvalid(error)
              ? { status: "invalidated" as const }
              : { status: "error" as const, error };
          this.finishSessionMutation(operationVersion);
          this.state.set(failure);
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

  signIn(
    credentials: Omit<SignInRequest, "surface">,
  ): Observable<SessionResponse> {
    return defer((): Observable<SessionResponse> => {
      const operationVersion = this.beginSessionMutation();
      if (operationVersion === null)
        return this.sessionMutationError<SessionResponse>();

      const request: SignInRequest = { ...credentials, surface: "PORTAL" };
      this.accessTokens.clear();
      this.signOutError.set("");
      this.state.set({ status: "signing-in" });

      return this.authenticationApi.signIn(request).pipe(
        switchMap((response) =>
          this.loadIssuedSession(response, operationVersion),
        ),
        map((session) => {
          if (session === null)
            throw new Error("The Portal sign-in was superseded.");
          if (operationVersion === this.operationVersion) {
            this.finishSessionMutation(operationVersion);
            this.state.set({ status: "authenticated", session });
          }
          return session;
        }),
        catchError((error: unknown) => {
          if (operationVersion === this.operationVersion) {
            this.accessTokens.clear();
            this.finishSessionMutation(operationVersion);
            this.state.set(
              isUnauthenticated(error)
                ? { status: "anonymous" }
                : { status: "error", error },
            );
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
      const previousSession =
        current.status === "authenticated" || current.status === "signing-out"
          ? current.session
          : null;
      this.signOutError.set("");

      if (previousSession)
        this.state.set({ status: "signing-out", session: previousSession });
      else this.state.set({ status: "loading" });

      return this.authenticationApi.signOut().pipe(
        map(() => {
          if (operationVersion === this.operationVersion) {
            this.accessTokens.clear();
            this.finishSessionMutation(operationVersion);
            this.state.set({ status: "anonymous" });
          }
          return undefined;
        }),
        catchError((error: unknown) => {
          if (
            operationVersion === this.operationVersion &&
            isUnauthenticated(error)
          ) {
            this.accessTokens.clear();
            this.finishSessionMutation(operationVersion);
            this.state.set({ status: "anonymous" });
            return of(undefined);
          }
          if (
            operationVersion === this.operationVersion &&
            isContextInvalid(error)
          ) {
            this.accessTokens.clear();
            this.finishSessionMutation(operationVersion);
            this.state.set({ status: "invalidated" });
            return of(undefined);
          }
          if (operationVersion === this.operationVersion) {
            this.finishSessionMutation(operationVersion);
            if (previousSession)
              this.state.set({
                status: "authenticated",
                session: previousSession,
              });
            else this.state.set({ status: "error", error });
            this.signOutError.set(
              "Sign-out could not be confirmed. Try again before leaving this session.",
            );
          }
          return throwError(() => error);
        }),
        finalize(() => this.finishSessionMutation(operationVersion)),
      );
    }).pipe(shareSessionMutation());
  }

  refreshAfterUnauthorized(
    lease: PortalSessionLease,
  ): Observable<PortalSessionLease | null> {
    return defer((): Observable<PortalSessionLease | null> => {
      if (!this.isSessionLeaseCurrent(lease)) return of(null);
      const operationVersion = this.beginSessionMutation();
      if (operationVersion === null)
        return this.sessionMutationError<PortalSessionLease | null>();

      this.state.set({ status: "loading" });
      this.accessTokens.clear();
      return this.refreshAndLoadSession(operationVersion).pipe(
        map((session) => {
          if (operationVersion !== this.operationVersion || session === null)
            return null;
          const scope = portalSessionScope(session);
          if (!scope || !sameScope(scope, lease.scope)) {
            this.accessTokens.clear();
            this.finishSessionMutation(operationVersion);
            this.state.set({ status: "invalidated" });
            return null;
          }
          this.finishSessionMutation(operationVersion);
          this.state.set({ status: "authenticated", session });
          return this.captureSessionLease();
        }),
        catchError((error: unknown) => {
          if (operationVersion === this.operationVersion) {
            this.accessTokens.clear();
            this.finishSessionMutation(operationVersion);
            this.state.set(
              isUnauthenticated(error)
                ? { status: "anonymous" }
                : isContextInvalid(error)
                  ? { status: "invalidated" }
                  : { status: "error", error },
            );
          }
          return of(null);
        }),
        finalize(() => this.finishSessionMutation(operationVersion)),
      );
    }).pipe(shareSessionMutation());
  }

  captureSessionLease(): PortalSessionLease | null {
    const current = this.state();
    if (
      this.sessionMutationVersion !== null ||
      current.status !== "authenticated"
    )
      return null;
    const scope = portalSessionScope(current.session);
    return scope ? { epoch: this.operationVersion, scope } : null;
  }

  isSessionLeaseCurrent(lease: PortalSessionLease): boolean {
    const current = this.state();
    if (
      this.sessionMutationVersion !== null ||
      lease.epoch !== this.operationVersion ||
      current.status !== "authenticated"
    ) {
      return false;
    }
    const scope = portalSessionScope(current.session);
    return scope !== null && sameScope(scope, lease.scope);
  }

  expireSessionIfCurrent(lease: PortalSessionLease): boolean {
    if (!this.isSessionLeaseCurrent(lease)) return false;
    this.clearSession({ status: "anonymous" });
    return true;
  }

  invalidateContextIfCurrent(lease: PortalSessionLease): boolean {
    if (!this.isSessionLeaseCurrent(lease)) return false;
    this.clearSession({ status: "invalidated" });
    return true;
  }

  private loadExistingSession(
    operationVersion: number,
  ): Observable<SessionResponse | null> {
    return this.authenticationApi.getCurrentSession().pipe(
      catchError((error: unknown) => {
        if (!isUnauthenticated(error)) return throwError(() => error);
        if (operationVersion !== this.operationVersion) return of(null);
        this.accessTokens.clear();
        return this.refreshAndLoadSession(operationVersion);
      }),
      map((session) => {
        if (session === null) return null;
        if (!portalSessionScope(session))
          throw new Error(
            "The API session did not include a complete Portal access context.",
          );
        return session;
      }),
    );
  }

  private refreshAndLoadSession(
    operationVersion: number,
  ): Observable<SessionResponse | null> {
    return this.authenticationApi
      .refresh()
      .pipe(
        switchMap((response) =>
          this.loadIssuedSession(response, operationVersion),
        ),
      );
  }

  private loadIssuedSession(
    response: AuthenticationResponse,
    operationVersion: number,
  ): Observable<SessionResponse | null> {
    const accessToken = isRecord(response)
      ? nonBlankString(response["accessToken"])
      : null;
    if (!accessToken)
      return throwError(
        () =>
          new Error(
            "The API authentication response did not include an access token.",
          ),
      );
    if (operationVersion !== this.operationVersion) return of(null);

    this.accessTokens.set(accessToken);
    return this.authenticationApi.getCurrentSession().pipe(
      map((session) => {
        if (!portalSessionScope(session))
          throw new Error(
            "The API session did not include a complete Portal access context.",
          );
        return session;
      }),
    );
  }

  private clearSession(state: PortalSessionState): void {
    this.operationVersion++;
    this.restorationRequest = null;
    this.accessTokens.clear();
    this.signOutError.set("");
    this.state.set(state);
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
}

function portalSessionScope(
  session: SessionResponse | null | undefined,
): PortalSessionScope | null {
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
    session["surface"] !== "PORTAL" ||
    !userId ||
    !tenantId ||
    !workspaceId ||
    !membershipId
  )
    return null;
  return { userId, tenantId, workspaceId, membershipId, surface: "PORTAL" };
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
  left: PortalSessionScope,
  right: PortalSessionScope,
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
