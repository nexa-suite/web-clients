import { Injectable, inject, signal } from '@angular/core';
import { NexaAccessTokenStore, NexaApiError, NexaAuthenticationApi } from '@nexa/api';
import type { AuthenticationResponse, SessionResponse, SignInRequest, WorkspacePreviewResponse } from '@nexa/api';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';

export type PlatformSessionState =
  | { readonly status: 'idle' | 'loading' | 'signing-in' | 'unauthenticated' }
  | { readonly status: 'authenticated'; readonly session: SessionResponse }
  | { readonly status: 'error'; readonly error: unknown };

export interface PlatformSignInCredentials {
  readonly identifier: string;
  readonly password: string;
  readonly workspaceSlug: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformSessionStore {
  private readonly authenticationApi = inject(NexaAuthenticationApi);
  private readonly accessTokens = inject(NexaAccessTokenStore);
  private operationVersion = 0;
  private restorationRequest: Observable<PlatformSessionState> | null = null;

  readonly state = signal<PlatformSessionState>({ status: 'idle' });

  previewWorkspace(workspaceSlug: string): Observable<WorkspacePreviewResponse> {
    return this.authenticationApi.previewWorkspace({ workspaceSlug });
  }

  restoreSession(): Observable<PlatformSessionState> {
    const current = this.state();
    if (current.status === 'authenticated') return of(current);
    if (this.restorationRequest) return this.restorationRequest;
    if (current.status !== 'idle') return of(current);

    const operationVersion = ++this.operationVersion;
    this.state.set({ status: 'loading' });

    const request = this.authenticationApi.refresh().pipe(
      switchMap((response) => this.loadSession(response, operationVersion)),
      map((session) => {
        if (operationVersion !== this.operationVersion || session === null) {
          return this.state();
        }
        const authenticated: PlatformSessionState = { status: 'authenticated', session };
        this.state.set(authenticated);
        return authenticated;
      }),
      catchError((error: unknown) => {
        if (operationVersion !== this.operationVersion) return of(this.state());
        this.accessTokens.clear();
        const failure: PlatformSessionState = error instanceof NexaApiError && error.kind === 'unauthenticated'
          ? { status: 'unauthenticated' }
          : { status: 'error', error };
        this.state.set(failure);
        return of(failure);
      }),
      finalize(() => {
        if (this.restorationRequest === request) this.restorationRequest = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.restorationRequest = request;
    return request;
  }

  signIn(credentials: PlatformSignInCredentials): Observable<SessionResponse> {
    const operationVersion = ++this.operationVersion;
    this.restorationRequest = null;
    this.accessTokens.clear();
    this.state.set({ status: 'signing-in' });

    const request: SignInRequest = { ...credentials, surface: 'PLATFORM' };
    return this.authenticationApi.signIn(request).pipe(
      switchMap((response) => this.loadSession(response, operationVersion)),
      map((session) => {
        if (session === null) throw new Error('The sign-in operation was superseded.');
        if (operationVersion === this.operationVersion) {
          this.state.set({ status: 'authenticated', session });
        }
        return session;
      }),
      catchError((error: unknown) => {
        if (operationVersion === this.operationVersion) {
          this.accessTokens.clear();
          this.state.set({ status: 'unauthenticated' });
        }
        return throwError(() => error);
      }),
    );
  }

  signOut(): Observable<void> {
    const operationVersion = ++this.operationVersion;
    this.restorationRequest = null;
    if (!this.accessTokens.hasAccessToken()) {
      this.state.set({ status: 'unauthenticated' });
      return of(undefined);
    }

    return this.authenticationApi.signOut().pipe(
      tap(() => {
        if (operationVersion !== this.operationVersion) return;
        this.accessTokens.clear();
        this.state.set({ status: 'unauthenticated' });
      }),
      catchError((error: unknown) => {
        if (operationVersion === this.operationVersion
          && error instanceof NexaApiError
          && error.kind === 'unauthenticated') {
          this.accessTokens.clear();
          this.state.set({ status: 'unauthenticated' });
          return of(undefined);
        }
        return throwError(() => error);
      }),
    );
  }

  expireLocalSession(): void {
    this.operationVersion++;
    this.restorationRequest = null;
    this.accessTokens.clear();
    this.state.set({ status: 'unauthenticated' });
  }

  private loadSession(
    response: AuthenticationResponse,
    operationVersion: number,
  ): Observable<SessionResponse | null> {
    const accessToken = response.accessToken?.trim();
    if (!accessToken) {
      return throwError(() => new Error('The API authentication response did not include an access token.'));
    }
    if (operationVersion !== this.operationVersion) return of(null);

    this.accessTokens.set(accessToken);
    return this.authenticationApi.getCurrentSession();
  }
}
