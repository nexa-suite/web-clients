export type NexaSurface = 'PLATFORM' | 'PORTAL';

export const NEXA_AUTH_API_PATHS = {
  workspacePreview: '/auth/workspace-previews',
  signIn: '/authentication/sign-in',
  refresh: '/authentication/refresh',
  signOut: '/authentication/sign-out',
  session: '/session',
} as const;

export interface WorkspacePreviewRequest {
  workspaceSlug: string;
}

export interface WorkspacePreviewResponse {
  recognized?: boolean;
  displayName?: string;
  workspaceUrl?: string;
  logoUrl?: string;
  loginAvailable?: boolean;
}

export interface RefreshRequestHeaders {
  'X-Nexa-Surface': NexaSurface;
}

export interface SignOutRequestHeaders {
  'X-Nexa-Surface'?: NexaSurface;
}

export interface SessionRequestHeaders {
  Authorization: string;
}

export interface SignInRequest {
  identifier: string;
  password: string;
  workspaceSlug: string;
  surface: NexaSurface;
}

export interface AuthenticationResponse {
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number;
  session?: SessionContext;
}

export interface SessionContext {
  userId?: string;
  displayName?: string;
  email?: string;
  preferredLanguage?: string;
  tenantId?: string;
  tenantSlug?: string;
  workspaceId?: string;
  workspaceSlug?: string;
  membershipId?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
  roleDefinitionIds?: readonly string[];
  authorizationVersion?: number;
  surface?: string;
}

export interface SessionResponse {
  user?: SessionUser;
  tenant?: TenantContext;
  workspace?: WorkspaceContext;
  membership?: MembershipContext;
  surface?: string;
}

export interface SessionUser {
  userId?: string;
  displayName?: string;
  email?: string;
  preferredLanguage?: string;
}

export interface TenantContext {
  tenantId?: string;
  tenantSlug?: string;
}

export interface WorkspaceContext {
  workspaceId?: string;
  workspaceSlug?: string;
}

export interface MembershipContext {
  membershipId?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
  roleDefinitionIds?: readonly string[];
  authorizationVersion?: number;
}

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  properties?: Readonly<Record<string, unknown>>;
}

export interface NexaProblemDetail extends ProblemDetail {
  code: string;
  correlationId: string;
  category: string;
  retryable: boolean;
  traceId?: string;
  errors?: readonly Readonly<Record<string, unknown>>[];
}

export interface ApiProblemDetails extends ProblemDetail {
  code?: string;
  correlationId?: string;
  category?: string;
  retryable?: boolean;
  traceId?: string;
  errors?: readonly Readonly<Record<string, unknown>>[];
}
