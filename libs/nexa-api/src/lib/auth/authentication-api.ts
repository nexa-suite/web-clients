import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuthenticationResponse,
  NEXA_AUTH_API_PATHS,
  SessionResponse,
  SignInRequest,
  WorkspacePreviewRequest,
  WorkspacePreviewResponse,
} from '../contracts/authentication.contracts';
import { NEXA_API_HTTP_CONFIGURATION } from '../http/nexa-http';

/** Typed browser transport for the API's current authentication contract. */
@Injectable({ providedIn: 'root' })
export class NexaAuthenticationApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);

  previewWorkspace(request: WorkspacePreviewRequest): Observable<WorkspacePreviewResponse> {
    return this.http.post<WorkspacePreviewResponse>(
      this.url(NEXA_AUTH_API_PATHS.workspacePreview),
      request,
    );
  }

  signIn(request: SignInRequest): Observable<AuthenticationResponse> {
    return this.http.post<AuthenticationResponse>(
      this.url(NEXA_AUTH_API_PATHS.signIn),
      request,
    );
  }

  refresh(): Observable<AuthenticationResponse> {
    return this.http.post<AuthenticationResponse>(
      this.url(NEXA_AUTH_API_PATHS.refresh),
      null,
    );
  }

  getCurrentSession(): Observable<SessionResponse> {
    return this.http.get<SessionResponse>(this.url(NEXA_AUTH_API_PATHS.session));
  }

  signOut(): Observable<void> {
    return this.http.post<void>(this.url(NEXA_AUTH_API_PATHS.signOut), null);
  }

  private url(path: string): string {
    return `${this.configuration.apiBaseUrl}${path}`;
  }
}
