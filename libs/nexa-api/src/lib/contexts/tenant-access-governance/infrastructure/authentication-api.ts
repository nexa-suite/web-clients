import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import {
  AuthenticationResponse,
  AccessContextsResponse,
  CsrfTokenResponse,
  SelectAccessContextRequest,
  NEXA_AUTH_API_PATHS,
  PasswordResetRequest,
  PasswordResetResponse,
  PasswordResetSubmission,
  SessionResponse,
  SignInRequest,
  WorkspacePreviewRequest,
  WorkspacePreviewResponse,
} from '../contracts/authentication.contracts';
import { NEXA_API_HTTP_CONFIGURATION, NEXA_REQUEST_POLICY } from '../../../http/nexa-http';

/** Typed browser transport for the API's current authentication contract. */
@Injectable({ providedIn: 'root' })
export class NexaAuthenticationApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);

  previewWorkspace(request: WorkspacePreviewRequest): Observable<WorkspacePreviewResponse> {
    return this.http.post<WorkspacePreviewResponse>(
      this.url(NEXA_AUTH_API_PATHS.workspacePreview),
      request,
      { context: this.policy(true, false) },
    );
  }

  requestPasswordReset(request: PasswordResetRequest): Observable<PasswordResetResponse> {
    return this.http.post<PasswordResetResponse>(
      this.url(NEXA_AUTH_API_PATHS.passwordResetRequest),
      request,
      { context: this.policy(true, false) },
    );
  }

  resetPassword(request: PasswordResetSubmission): Observable<void> {
    return this.http.post<void>(
      this.url(NEXA_AUTH_API_PATHS.passwordReset),
      request,
      { context: this.policy(true, false) },
    );
  }

  signIn(request: SignInRequest): Observable<AuthenticationResponse> {
    return this.withBrowserCsrfToken((token) => this.http.post<AuthenticationResponse>(
      this.url(NEXA_AUTH_API_PATHS.signIn),
      request,
      { headers: this.csrfHeaders(token), context: this.policy(true, true) },
    ));
  }

  refresh(): Observable<AuthenticationResponse> {
    return this.withBrowserCsrfToken((token) => this.http.post<AuthenticationResponse>(
      this.url(NEXA_AUTH_API_PATHS.refresh),
      null,
      { headers: this.csrfHeaders(token), context: this.policy(true, true, true) },
    ));
  }

  getCurrentSession(): Observable<SessionResponse> {
    return this.http.get<SessionResponse>(this.url(NEXA_AUTH_API_PATHS.session));
  }

  signOut(): Observable<void> {
    return this.withBrowserCsrfToken((token) => this.http.post<void>(
      this.url(NEXA_AUTH_API_PATHS.signOut),
      null,
      { headers: this.csrfHeaders(token), context: this.policy(false, true, true) },
    ));
  }

  listAccessContexts(): Observable<AccessContextsResponse> {
    return this.http.get<AccessContextsResponse>(this.url(NEXA_AUTH_API_PATHS.accessContexts), {
      context: this.policy(false, false, true),
    });
  }

  selectAccessContext(request: SelectAccessContextRequest): Observable<AuthenticationResponse> {
    return this.http.post<AuthenticationResponse>(this.url(NEXA_AUTH_API_PATHS.accessContextSelections), request, {
      context: this.policy(false, true, true),
    });
  }

  private policy(omitBearer: boolean, withCredentials: boolean, surface = false): HttpContext {
    return new HttpContext().set(NEXA_REQUEST_POLICY, {
      omitBearer,
      withCredentials,
      headers: surface ? { 'X-Nexa-Surface': this.configuration.surface } : {},
    });
  }

  private withBrowserCsrfToken<T>(send: (token: string) => Observable<T>): Observable<T> {
    return this.http.get<CsrfTokenResponse>(this.url(NEXA_AUTH_API_PATHS.csrfToken), {
      context: this.policy(true, true),
    }).pipe(switchMap(({ token }) => send(token)));
  }

  private csrfHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ 'X-Nexa-CSRF': token });
  }

  private url(path: string): string {
    return `${this.configuration.apiBaseUrl}${path}`;
  }
}
