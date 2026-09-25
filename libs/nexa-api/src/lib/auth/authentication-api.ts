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
import { NexaApiTransport } from '../http/nexa-api-transport';

/** Typed browser transport for the API's current authentication contract. */
@Injectable({ providedIn: 'root' })
export class NexaAuthenticationApi {
  private readonly transport = inject(NexaApiTransport);

  previewWorkspace(request: WorkspacePreviewRequest): Observable<WorkspacePreviewResponse> {
    return this.transport.post<WorkspacePreviewResponse>(
      NEXA_AUTH_API_PATHS.workspacePreview,
      request,
    );
  }

  signIn(request: SignInRequest): Observable<AuthenticationResponse> {
    return this.transport.post<AuthenticationResponse>(
      NEXA_AUTH_API_PATHS.signIn,
      request,
    );
  }

  refresh(): Observable<AuthenticationResponse> {
    return this.transport.post<AuthenticationResponse>(
      NEXA_AUTH_API_PATHS.refresh,
      null,
    );
  }

  getCurrentSession(): Observable<SessionResponse> {
    return this.transport.get<SessionResponse>(NEXA_AUTH_API_PATHS.session);
  }

  signOut(): Observable<void> {
    return this.transport.post<void>(NEXA_AUTH_API_PATHS.signOut, null);
  }
}
