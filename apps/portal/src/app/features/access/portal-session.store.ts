import { computed, inject, Injectable, signal } from '@angular/core';
import { NexaAccessTokenStore, NexaApiError } from '@nexa/api';
import type { SessionResponse, SignInRequest, WorkspacePreviewResponse } from '@nexa/api';
import { PortalAccessApiAdapter, type BuyerAccountProjection } from './access-api.adapter';

export type PortalSessionState =
  | 'unknown'
  | 'checking'
  | 'anonymous'
  | 'authorized'
  | 'relationship-required'
  | 'unavailable';

export type WorkspacePreviewState = 'idle' | 'checking' | 'recognized' | 'unavailable' | 'error';

@Injectable({ providedIn: 'root' })
export class PortalSessionStore {
  private readonly api = inject(PortalAccessApiAdapter);
  private readonly tokens = inject(NexaAccessTokenStore);
  private initialization: Promise<PortalSessionState> | null = null;
  private requestRevision = 0;

  private readonly stateValue = signal<PortalSessionState>('unknown');
  private readonly sessionValue = signal<SessionResponse | null>(null);
  private readonly accountValue = signal<BuyerAccountProjection | null>(null);
  private readonly previewValue = signal<WorkspacePreviewResponse | null>(null);
  private readonly previewStateValue = signal<WorkspacePreviewState>('idle');
  private readonly busyValue = signal(false);
  private readonly signOutErrorValue = signal('');

  readonly state = this.stateValue.asReadonly();
  readonly session = this.sessionValue.asReadonly();
  readonly buyerAccount = this.accountValue.asReadonly();
  readonly workspacePreview = this.previewValue.asReadonly();
  readonly workspacePreviewState = this.previewStateValue.asReadonly();
  readonly busy = this.busyValue.asReadonly();
  readonly signOutError = this.signOutErrorValue.asReadonly();
  readonly isBuyerAuthorized = computed(() => this.stateValue() === 'authorized');

  async initialize(): Promise<PortalSessionState> {
    if (this.stateValue() === 'authorized' || this.stateValue() === 'relationship-required') {
      return this.stateValue();
    }
    if (this.initialization) return this.initialization;

    const revision = ++this.requestRevision;
    this.stateValue.set('checking');
    this.initialization = this.restoreSession(revision);
    try {
      return await this.initialization;
    } finally {
      this.initialization = null;
    }
  }

  async previewWorkspace(workspaceSlug: string): Promise<boolean> {
    this.previewStateValue.set('checking');
    this.previewValue.set(null);
    try {
      const preview = await this.api.previewWorkspace(workspaceSlug.trim());
      this.previewValue.set(preview);
      const recognized = preview.recognized === true && preview.loginAvailable !== false;
      this.previewStateValue.set(recognized ? 'recognized' : 'unavailable');
      return recognized;
    } catch {
      this.previewStateValue.set('error');
      return false;
    }
  }

  async signIn(credentials: SignInRequest): Promise<PortalSessionState> {
    const revision = ++this.requestRevision;
    this.busyValue.set(true);
    this.stateValue.set('checking');
    this.signOutErrorValue.set('');
    this.sessionValue.set(null);
    this.accountValue.set(null);
    try {
      const authentication = await this.api.signIn({ ...credentials, surface: 'PORTAL' });
      if (revision !== this.requestRevision) return this.stateValue();
      if (!authentication.accessToken) {
        this.tokens.clear();
        this.stateValue.set('unavailable');
        return 'unavailable';
      }
      this.tokens.set(authentication.accessToken);
      return await this.loadBuyerProjection(revision);
    } catch (error) {
      if (revision !== this.requestRevision) return this.stateValue();
      this.tokens.clear();
      this.stateValue.set(error instanceof NexaApiError && error.kind === 'network'
        ? 'unavailable'
        : 'anonymous');
      return this.stateValue();
    } finally {
      if (revision === this.requestRevision) this.busyValue.set(false);
    }
  }

  async signOut(): Promise<boolean> {
    const revision = ++this.requestRevision;
    this.busyValue.set(true);
    try {
      await this.api.signOut();
      if (revision !== this.requestRevision) return false;
      this.tokens.clear();
      this.sessionValue.set(null);
      this.accountValue.set(null);
      this.stateValue.set('anonymous');
      this.signOutErrorValue.set('');
      return true;
    } catch {
      if (revision === this.requestRevision) {
        this.signOutErrorValue.set('Sign-out could not be confirmed. Try again before leaving this session.');
      }
      return false;
    } finally {
      if (revision === this.requestRevision) {
        this.busyValue.set(false);
      }
    }
  }

  private async restoreSession(revision: number): Promise<PortalSessionState> {
    if (!this.tokens.read()) {
      try {
        const authentication = await this.api.refresh();
        if (revision !== this.requestRevision) return this.stateValue();
        if (!authentication.accessToken) {
          this.stateValue.set('anonymous');
          return 'anonymous';
        }
        this.tokens.set(authentication.accessToken);
      } catch (error) {
        if (revision !== this.requestRevision) return this.stateValue();
        this.tokens.clear();
        const state = error instanceof NexaApiError && ['network', 'timeout', 'server'].includes(error.kind)
          ? 'unavailable'
          : 'anonymous';
        this.stateValue.set(state);
        return state;
      }
    }
    return this.loadBuyerProjection(revision);
  }

  private async loadBuyerProjection(revision: number, allowRefresh = true): Promise<PortalSessionState> {
    let session: SessionResponse;
    try {
      session = await this.api.session();
      if (revision !== this.requestRevision) return this.stateValue();
    } catch (error) {
      if (revision !== this.requestRevision) return this.stateValue();
      this.sessionValue.set(null);
      this.accountValue.set(null);
      if (error instanceof NexaApiError && error.kind === 'unauthenticated') {
        return allowRefresh ? this.refreshAndReload(revision) : this.finishAnonymous();
      }
      const state = error instanceof NexaApiError && ['network', 'timeout', 'server'].includes(error.kind)
        ? 'unavailable'
        : error instanceof NexaApiError && error.kind === 'forbidden'
          ? 'relationship-required'
          : 'unavailable';
      this.stateValue.set(state);
      return state;
    }

    if (session.surface !== 'PORTAL' || !session.membership?.membershipId) {
      this.stateValue.set('relationship-required');
      this.sessionValue.set(session);
      this.accountValue.set(null);
      return 'relationship-required';
    }

    let account: BuyerAccountProjection;
    try {
      account = await this.api.buyerAccount();
      if (revision !== this.requestRevision) return this.stateValue();
    } catch (error) {
      if (revision !== this.requestRevision) return this.stateValue();
      this.sessionValue.set(session);
      this.accountValue.set(null);
      if (error instanceof NexaApiError && error.kind === 'unauthenticated') {
        return allowRefresh ? this.refreshAndReload(revision) : this.finishAnonymous();
      }
      const state = error instanceof NexaApiError && ['forbidden', 'not-found'].includes(error.kind)
        ? 'relationship-required'
        : 'unavailable';
      this.stateValue.set(state);
      return state;
    }

    this.sessionValue.set(session);
    this.accountValue.set(account);
    const relationshipMatches = account.buyerMembershipId === session.membership.membershipId;
    const state: PortalSessionState = relationshipMatches ? 'authorized' : 'relationship-required';
    this.stateValue.set(state);
    return state;
  }

  private async refreshAndReload(revision: number): Promise<PortalSessionState> {
    this.tokens.clear();
    try {
      const authentication = await this.api.refresh();
      if (revision !== this.requestRevision) return this.stateValue();
      if (!authentication.accessToken) {
        this.stateValue.set('anonymous');
        return 'anonymous';
      }
      this.tokens.set(authentication.accessToken);
      return await this.loadBuyerProjection(revision, false);
    } catch (error) {
      if (revision !== this.requestRevision) return this.stateValue();
      this.tokens.clear();
      const state = error instanceof NexaApiError && ['network', 'timeout', 'server'].includes(error.kind)
        ? 'unavailable'
        : 'anonymous';
      this.stateValue.set(state);
      return state;
    }
  }

  private finishAnonymous(): PortalSessionState {
    this.tokens.clear();
    this.sessionValue.set(null);
    this.accountValue.set(null);
    this.stateValue.set('anonymous');
    return 'anonymous';
  }
}
