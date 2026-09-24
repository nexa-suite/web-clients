import { inject, Injectable } from '@angular/core';
import type {
  AuthenticationResponse,
  SessionResponse,
  SignInRequest,
  WorkspacePreviewResponse,
} from '@nexa/api';
import { NexaHttpClient } from '@nexa/api';

export interface BuyerAccountProjection {
  readonly id?: string;
  readonly businessName?: string;
  readonly commercialName?: string;
  readonly status?: string;
  readonly buyerMembershipId?: string;
}

@Injectable({ providedIn: 'root' })
export class PortalAccessApiAdapter {
  private readonly http = inject(NexaHttpClient);

  previewWorkspace(workspaceSlug: string): Promise<WorkspacePreviewResponse> {
    return this.http.post<WorkspacePreviewResponse>(
      '/auth/workspace-previews',
      { workspaceSlug },
    );
  }

  signIn(credentials: SignInRequest): Promise<AuthenticationResponse> {
    return this.http.post<AuthenticationResponse>(
      '/authentication/sign-in',
      credentials,
    );
  }

  refresh(): Promise<AuthenticationResponse> {
    return this.http.post<AuthenticationResponse>(
      '/authentication/refresh',
      null,
    );
  }

  session(): Promise<SessionResponse> {
    return this.http.get<SessionResponse>('/session');
  }

  buyerAccount(): Promise<BuyerAccountProjection> {
    return this.http.get<BuyerAccountProjection>('/client-accounts/me');
  }

  signOut(): Promise<void> {
    return this.http.post<void>('/authentication/sign-out', null);
  }
}
