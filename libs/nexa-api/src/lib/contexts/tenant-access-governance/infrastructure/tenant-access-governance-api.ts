import {
  HttpClient,
  HttpHeaders,
  HttpParams,
  HttpResponse,
} from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type {
  CreateInvitationRequest,
  CreateRoleDefinitionRequest,
  InvitationPageResponse,
  InvitationResponse,
  InternalMembershipRole,
  OrganizationSummaryResponse,
  PermissionCatalogEntryResponse,
  RoleDefinitionResponse,
  UpdateRoleDefinitionRequest,
  WorkspaceMembershipResponse,
  WorkspaceSummaryResponse,
} from "../contracts/tenant-access-governance.contracts";
import { NEXA_TENANT_ACCESS_API_PATHS } from "../contracts/tenant-access-governance.contracts";

/** Thin client for server-authoritative Tenant membership and role governance. */
@Injectable({ providedIn: "root" })
export class NexaTenantAccessGovernanceApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl;

  getOrganization(): Observable<HttpResponse<OrganizationSummaryResponse>> {
    return this.http.get<OrganizationSummaryResponse>(
      this.url(NEXA_TENANT_ACCESS_API_PATHS.organization),
      { observe: "response" },
    );
  }

  listWorkspaces(): Observable<readonly WorkspaceSummaryResponse[]> {
    return this.http.get<readonly WorkspaceSummaryResponse[]>(
      this.url(NEXA_TENANT_ACCESS_API_PATHS.workspaces),
    );
  }

  listMemberships(): Observable<readonly WorkspaceMembershipResponse[]> {
    return this.http.get<readonly WorkspaceMembershipResponse[]>(
      this.url(NEXA_TENANT_ACCESS_API_PATHS.memberships),
    );
  }

  getMembership(
    membershipId: string,
  ): Observable<HttpResponse<WorkspaceMembershipResponse>> {
    return this.http.get<WorkspaceMembershipResponse>(
      this.membershipPath(membershipId),
      { observe: "response" },
    );
  }

  updateMembershipRoles(
    membershipId: string,
    version: number,
    roles: readonly InternalMembershipRole[],
  ): Observable<HttpResponse<WorkspaceMembershipResponse>> {
    return this.http.patch<WorkspaceMembershipResponse>(
      `${this.membershipPath(membershipId)}/roles`,
      { roles },
      this.versionOptions(version),
    );
  }

  updateMembershipRoleDefinitions(
    membershipId: string,
    version: number,
    roleDefinitionIds: readonly string[],
  ): Observable<HttpResponse<WorkspaceMembershipResponse>> {
    return this.http.patch<WorkspaceMembershipResponse>(
      `${this.membershipPath(membershipId)}/roles`,
      { roleDefinitionIds },
      this.versionOptions(version),
    );
  }

  suspendMembership(
    membershipId: string,
    version: number,
  ): Observable<HttpResponse<WorkspaceMembershipResponse>> {
    return this.membershipStatusCommand(membershipId, "suspensions", version);
  }

  revokeMembership(
    membershipId: string,
    version: number,
  ): Observable<HttpResponse<WorkspaceMembershipResponse>> {
    return this.membershipStatusCommand(membershipId, "revocations", version);
  }

  reactivateMembership(
    membershipId: string,
    version: number,
  ): Observable<HttpResponse<WorkspaceMembershipResponse>> {
    return this.membershipStatusCommand(membershipId, "reactivations", version);
  }

  listInvitations(
    page = 0,
    pageSize = 25,
  ): Observable<InvitationPageResponse> {
    requirePage(page, pageSize);
    return this.http.get<InvitationPageResponse>(
      this.url(NEXA_TENANT_ACCESS_API_PATHS.invitations),
      { params: new HttpParams().set("page", page).set("pageSize", pageSize) },
    );
  }

  getInvitation(
    invitationId: string,
  ): Observable<HttpResponse<InvitationResponse>> {
    return this.http.get<InvitationResponse>(
      this.invitationPath(invitationId),
      { observe: "response" },
    );
  }

  createInvitation(
    request: CreateInvitationRequest,
    idempotencyKey: string,
  ): Observable<HttpResponse<InvitationResponse>> {
    return this.http.post<InvitationResponse>(
      this.url(NEXA_TENANT_ACCESS_API_PATHS.invitations),
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  revokeInvitation(
    invitationId: string,
    version: number,
  ): Observable<HttpResponse<InvitationResponse>> {
    return this.invitationStatusCommand(invitationId, "revocations", version);
  }

  resendInvitation(
    invitationId: string,
    version: number,
  ): Observable<HttpResponse<InvitationResponse>> {
    return this.invitationStatusCommand(invitationId, "resends", version);
  }

  listRoles(): Observable<readonly RoleDefinitionResponse[]> {
    return this.http.get<readonly RoleDefinitionResponse[]>(
      this.url(NEXA_TENANT_ACCESS_API_PATHS.roles),
    );
  }

  getRole(roleId: string): Observable<HttpResponse<RoleDefinitionResponse>> {
    return this.http.get<RoleDefinitionResponse>(this.rolePath(roleId), {
      observe: "response",
    });
  }

  createRole(
    request: CreateRoleDefinitionRequest,
  ): Observable<HttpResponse<RoleDefinitionResponse>> {
    return this.http.post<RoleDefinitionResponse>(
      this.url(NEXA_TENANT_ACCESS_API_PATHS.roles),
      request,
      { observe: "response" },
    );
  }

  updateRole(
    roleId: string,
    version: number,
    request: UpdateRoleDefinitionRequest,
  ): Observable<HttpResponse<RoleDefinitionResponse>> {
    return this.http.patch<RoleDefinitionResponse>(
      this.rolePath(roleId),
      request,
      this.versionOptions(version),
    );
  }

  deactivateRole(
    roleId: string,
    version: number,
  ): Observable<HttpResponse<RoleDefinitionResponse>> {
    return this.http.delete<RoleDefinitionResponse>(
      this.rolePath(roleId),
      this.versionOptions(version),
    );
  }

  listPermissionCatalog(): Observable<readonly PermissionCatalogEntryResponse[]> {
    return this.http.get<readonly PermissionCatalogEntryResponse[]>(
      this.url(NEXA_TENANT_ACCESS_API_PATHS.permissionCatalog),
    );
  }

  private membershipStatusCommand(
    membershipId: string,
    action: "suspensions" | "revocations" | "reactivations",
    version: number,
  ): Observable<HttpResponse<WorkspaceMembershipResponse>> {
    return this.http.post<WorkspaceMembershipResponse>(
      `${this.membershipPath(membershipId)}/${action}`,
      null,
      this.versionOptions(version),
    );
  }

  private invitationStatusCommand(
    invitationId: string,
    action: "revocations" | "resends",
    version: number,
  ): Observable<HttpResponse<InvitationResponse>> {
    return this.http.post<InvitationResponse>(
      `${this.invitationPath(invitationId)}/${action}`,
      null,
      this.versionOptions(version),
    );
  }

  private membershipPath(membershipId: string): string {
    return `${this.url(NEXA_TENANT_ACCESS_API_PATHS.memberships)}/${encodeURIComponent(requireId(membershipId))}`;
  }

  private invitationPath(invitationId: string): string {
    return `${this.url(NEXA_TENANT_ACCESS_API_PATHS.invitations)}/${encodeURIComponent(requireId(invitationId))}`;
  }

  private rolePath(roleId: string): string {
    return `${this.url(NEXA_TENANT_ACCESS_API_PATHS.roles)}/${encodeURIComponent(requireId(roleId))}`;
  }

  private versionOptions(version: number) {
    return {
      headers: new HttpHeaders({ "If-Match": quoteVersion(version) }),
      observe: "response" as const,
    };
  }

  private idempotencyOptions(idempotencyKey: string) {
    const key = idempotencyKey.trim();
    if (!key || key.length > 160) throw new Error("A valid idempotency key is required.");
    return {
      headers: new HttpHeaders({ "Idempotency-Key": key }),
      observe: "response" as const,
    };
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}

function requireId(value: string): string {
  const id = value.trim();
  if (!id) throw new Error("A resource identifier is required.");
  return id;
}

function quoteVersion(version: number): string {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("A current non-negative entity version is required.");
  }
  return `"${version}"`;
}

function requirePage(page: number, pageSize: number): void {
  if (!Number.isSafeInteger(page) || page < 0) throw new RangeError("Page must be a non-negative integer.");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new RangeError("Page size must be between 1 and 100.");
  }
}
