import { computed, inject, Injectable, signal } from "@angular/core";
import type { Observable } from "rxjs";
import { NexaApiError } from "@nexa/api";
import { NexaCommandRetryStore } from "@nexa/api";
import type {
  CreateInvitationRequest,
  CreateRoleDefinitionRequest,
  InternalMembershipRole,
  InvitationPageResponse,
  InvitationResponse,
  PermissionCatalogEntryResponse,
  RoleDefinitionResponse,
  UpdateRoleDefinitionRequest,
  WorkspaceMembershipResponse,
} from "@nexa/api";
import { NexaTenantAccessGovernanceApi } from "@nexa/api";
import { firstValueFrom } from "rxjs";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "./platform-session.store";

export const PLATFORM_INTERNAL_MEMBERSHIP_ROLES: readonly InternalMembershipRole[] = [
  "TENANT_ADMIN",
  "COMPANY_OWNER",
  "SALES",
  "WAREHOUSE",
  "LOGISTICS",
  "BUSINESS_OPERATIONS_MANAGER",
];

export interface PlatformTenantAccessGovernanceState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly lease: PlatformSessionLease | null;
  readonly memberships: readonly WorkspaceMembershipResponse[];
  readonly invitations: InvitationPageResponse | null;
  readonly roles: readonly RoleDefinitionResponse[];
  readonly permissionCatalog: readonly PermissionCatalogEntryResponse[];
  readonly message: string;
  readonly notice: string;
}

const EMPTY_STATE: PlatformTenantAccessGovernanceState = {
  status: "idle",
  lease: null,
  memberships: [],
  invitations: null,
  roles: [],
  permissionCatalog: [],
  message: "",
  notice: "",
};

const MEMBER_READ = "tenant.member.read";
const MEMBER_INVITE = "tenant.member.invite";
const MEMBER_MANAGE = "tenant.member.manage";
const ROLE_READ = "tenant.role.read";
const ROLE_MANAGE = "tenant.role.manage";
const ROLE_ASSIGN = "tenant.role.assign";

/**
 * Server-backed BC01 queries and commands. Every snapshot is fenced to the
 * active server-issued Tenant/Workspace lease; caller-supplied scope is never
 * sent for list queries.
 */
@Injectable({ providedIn: "root" })
export class PlatformTenantAccessGovernanceStore {
  private readonly api = inject(NexaTenantAccessGovernanceApi);
  private readonly retryStore = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly snapshot = signal<PlatformTenantAccessGovernanceState>(EMPTY_STATE);
  private readonly loadVersion = signal(0);
  private readonly commandPending = signal(false);

  readonly state = computed(() => {
    const snapshot = this.snapshot();
    if (!snapshot.lease || !this.sessions.isSessionLeaseCurrent(snapshot.lease)) {
      return EMPTY_STATE;
    }
    return snapshot;
  });

  readonly busy = this.commandPending.asReadonly();

  private readonly membership = computed(() => {
    const state = this.sessions.state();
    return state.status === "authenticated" ? state.session.membership ?? null : null;
  });

  private readonly permissions = computed(
    () => new Set((this.membership()?.permissions ?? []).map(normalizeCode)),
  );

  private readonly roleCodes = computed(
    () => new Set((this.membership()?.roles ?? []).map(normalizeCode)),
  );

  readonly isCompanyOwner = computed(() => this.roleCodes().has("company_owner"));
  readonly isTenantAdministrator = computed(() => this.roleCodes().has("tenant_admin"));

  readonly canReadMembers = computed(() => this.hasPermission(MEMBER_READ));
  readonly canReadRoles = computed(() => this.hasPermission(ROLE_READ));

  /** Company Owner pages are oversight-only even while AS-IS grants retain some writes. */
  private readonly canIssueTenantAdminCommands = computed(
    () => this.isTenantAdministrator() && !this.isCompanyOwner(),
  );

  readonly canInviteMembers = computed(
    () => this.canIssueTenantAdminCommands() && this.hasPermission(MEMBER_INVITE),
  );
  readonly canManageMemberships = computed(
    () => !this.isCompanyOwner() && this.hasPermission(MEMBER_MANAGE),
  );
  readonly canAssignRoles = computed(
    () =>
      this.canIssueTenantAdminCommands() &&
      this.hasPermission(ROLE_ASSIGN) &&
      this.canReadRoles(),
  );
  readonly canManageRoleDefinitions = computed(
    () =>
      this.canIssueTenantAdminCommands() &&
      this.hasPermission(ROLE_MANAGE) &&
      this.canReadRoles(),
  );

  readonly assignableRoleDefinitions = computed(() => {
    const state = this.state();
    const lease = state.lease;
    if (!lease) return [];
    return state.roles.filter((role) => isAssignableRoleDefinition(role, lease));
  });

  async load(invitationPage = this.state().invitations?.page ?? 0): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    if (!lease) {
      this.snapshot.set(EMPTY_STATE);
      return;
    }

    if (!Number.isSafeInteger(invitationPage) || invitationPage < 0) {
      this.snapshot.set({
        ...EMPTY_STATE,
        lease,
        status: "error",
        message: "Choose a valid invitation page.",
      });
      return;
    }

    const version = this.loadVersion() + 1;
    this.loadVersion.set(version);
    const readableMembers = this.canReadMembers();
    const readableRoles = this.canReadRoles();
    this.snapshot.set({
      ...EMPTY_STATE,
      lease,
      status: "loading",
    });

    if (!readableMembers && !readableRoles) {
      this.snapshot.set({
        ...EMPTY_STATE,
        lease,
        status: "error",
        message: "This active membership cannot read Tenant access governance.",
      });
      return;
    }

    try {
      const [memberships, invitations, roles, permissionCatalog] = await Promise.all([
        readableMembers ? firstValueFrom(this.api.listMemberships()) : Promise.resolve([]),
        readableMembers
          ? firstValueFrom(this.api.listInvitations(invitationPage, 25))
          : Promise.resolve(null),
        readableRoles ? firstValueFrom(this.api.listRoles()) : Promise.resolve([]),
        readableRoles
          ? firstValueFrom(this.api.listPermissionCatalog())
          : Promise.resolve([]),
      ]);

      if (!this.isCurrent(lease, version)) return;
      const scopedMemberships = requireScopedList(
        memberships,
        (value) => isMembershipInScope(value, lease),
        "membership",
      );
      const scopedInvitations = invitations
        ? requireInvitationPage(invitations, invitationPage, lease)
        : null;
      const scopedRoles = requireScopedList(
        roles,
        (value) => isRoleInScope(value, lease),
        "role definition",
      );
      const validCatalog = requirePermissionCatalog(permissionCatalog);

      this.snapshot.set({
        status: "ready",
        lease,
        memberships: scopedMemberships.filter(isInternalMembership),
        invitations: scopedInvitations,
        roles: scopedRoles,
        permissionCatalog: validCatalog,
        message: "",
        notice: "",
      });
    } catch (error) {
      if (this.invalidateSessionForError(lease, error)) return;
      if (!this.isCurrent(lease, version)) return;
      this.snapshot.set({
        ...EMPTY_STATE,
        lease,
        status: "error",
        message: safeFailureMessage(error, "load"),
      });
    }
  }

  async inviteMember(
    request: CreateInvitationRequest,
  ): Promise<boolean> {
    if (!this.canInviteMembers()) return false;
    const normalized = normalizeInvitation(request);
    if (!normalized) {
      this.setLocalError("Enter a valid name, email address, and at least one internal role.");
      return false;
    }
    const lease = this.sessions.captureSessionLease();
    if (!lease) return false;
    let payloadHash: string | null;
    try {
      payloadHash = await invitationPayloadHash(normalized);
    } catch {
      payloadHash = null;
    }
    if (!payloadHash || !this.sessions.isSessionLeaseCurrent(lease)) {
      this.setLocalError("This browser could not create a safe invitation retry key.");
      return false;
    }
    const storageKey = invitationRetryStorageKey(lease, payloadHash);
    let idempotencyKey: string | null;
    try {
      idempotencyKey = this.retryStore.read(storageKey);
      if (idempotencyKey === null) {
        const generated = globalThis.crypto?.randomUUID?.() ?? null;
        if (!isUuid(generated)) {
          this.setLocalError("This browser could not create a safe invitation retry key.");
          return false;
        }
        idempotencyKey = generated;
        this.retryStore.write(storageKey, idempotencyKey);
      }
    } catch {
      this.setLocalError("The invitation retry key could not be stored safely.");
      return false;
    }
    return this.runCommand(
      lease,
      () => this.api.createInvitation(normalized, idempotencyKey),
      (value) => isInvitationInScope(value, lease),
      "Invitation sent.",
      () => {
        this.retryStore.remove(storageKey);
      },
    );
  }

  async assignMembershipRoles(
    membershipId: string,
    version: number,
    roleDefinitionIds: readonly string[],
  ): Promise<boolean> {
    if (!this.canAssignRoles()) return false;
    const lease = this.sessions.captureSessionLease();
    if (!lease) return false;
    const current = this.state().memberships.find((value) => value.id === membershipId);
    if (
      !current ||
      !isInternalMembershipInScope(current, lease) ||
      current.version !== version ||
      current.status.toUpperCase() !== "ACTIVE"
    ) {
      this.setLocalError("Refresh the membership before changing its roles.");
      return false;
    }
    const availableRoleIds = new Set(
      this.assignableRoleDefinitions().map((role) => role.id),
    );
    const uniqueIds = [...new Set(roleDefinitionIds.map((value) => value.trim()))];
    if (
      uniqueIds.length === 0 ||
      uniqueIds.some((id) => !id || !availableRoleIds.has(id))
    ) {
      this.setLocalError("Keep at least one active internal role selected.");
      return false;
    }
    return this.runCommand(
      lease,
      () =>
        this.api.updateMembershipRoleDefinitions(
          membershipId,
          version,
          uniqueIds,
        ),
      (value) => isInternalMembershipInScope(value, lease),
      "Membership roles updated.",
    );
  }

  async changeMembershipStatus(
    action: "suspend" | "reactivate" | "revoke",
    membership: WorkspaceMembershipResponse,
  ): Promise<boolean> {
    if (!this.canManageMemberships()) return false;
    const lease = this.sessions.captureSessionLease();
    const current = this.state().memberships.find((value) => value.id === membership.id);
    if (
      !lease ||
      !current ||
      !isInternalMembershipInScope(current, lease) ||
      current.version !== membership.version ||
      !isAllowedMembershipTransition(action, current.status)
    ) {
      this.setLocalError("Refresh the membership before changing its status.");
      return false;
    }
    const operation = {
      suspend: () => this.api.suspendMembership(current.id, current.version),
      reactivate: () => this.api.reactivateMembership(current.id, current.version),
      revoke: () => this.api.revokeMembership(current.id, current.version),
    }[action];
    return this.runCommand(
      lease,
      operation,
      (value) => isInternalMembershipInScope(value, lease),
      `Membership ${{
        suspend: "suspended",
        reactivate: "reactivated",
        revoke: "revoked",
      }[action]}.`,
    );
  }

  async changeInvitationStatus(
    action: "resend" | "revoke",
    invitation: InvitationResponse,
  ): Promise<boolean> {
    if (!this.canManageMemberships()) return false;
    const lease = this.sessions.captureSessionLease();
    const current = this.state().invitations?.items.find((value) => value.id === invitation.id);
    if (
      !lease ||
      !current ||
      !isInvitationInScope(current, lease) ||
      current.version !== invitation.version ||
      current.status.toUpperCase() !== "PENDING"
    ) {
      this.setLocalError("Refresh the invitation before changing its status.");
      return false;
    }
    const operation =
      action === "resend"
        ? () => this.api.resendInvitation(current.id, current.version)
        : () => this.api.revokeInvitation(current.id, current.version);
    return this.runCommand(
      lease,
      operation,
      (value) => isInvitationInScope(value, lease),
      `Invitation ${action === "resend" ? "resent" : "revoked"}.`,
    );
  }

  async createRoleDefinition(
    input: Omit<CreateRoleDefinitionRequest, "workspaceId">,
  ): Promise<boolean> {
    if (!this.canManageRoleDefinitions()) return false;
    const lease = this.sessions.captureSessionLease();
    if (!lease) return false;
    if (!validRoleInput(input, this.state().permissionCatalog)) {
      this.setLocalError("Use a valid role code, name, description, and API catalog permission set.");
      return false;
    }
    const request: CreateRoleDefinitionRequest = {
      ...input,
      workspaceId: lease.scope.workspaceId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description.trim(),
      permissions: [...new Set(input.permissions)],
    };
    return this.runCommand(
      lease,
      () => this.api.createRole(request),
      (value) => isRoleInScope(value, lease),
      "Role definition created.",
    );
  }

  async updateRoleDefinition(
    role: RoleDefinitionResponse,
    input: UpdateRoleDefinitionRequest,
  ): Promise<boolean> {
    if (!this.canManageRoleDefinitions()) return false;
    if (
      role.type !== "CUSTOM" ||
      !validRoleInput({ code: role.code, ...input }, this.state().permissionCatalog)
    ) {
      this.setLocalError("Choose a custom role and valid fields and permissions from the API catalog.");
      return false;
    }
    const lease = this.sessions.captureSessionLease();
    const current = this.state().roles.find((value) => value.id === role.id);
    if (
      !lease ||
      !current ||
      !isRoleInScope(current, lease) ||
      current.version !== role.version ||
      current.type !== "CUSTOM" ||
      current.tenantId !== lease.scope.tenantId ||
      current.workspaceId !== lease.scope.workspaceId ||
      current.status !== "ACTIVE"
    ) {
      this.setLocalError("Refresh the role definition before changing it.");
      return false;
    }
    const request: UpdateRoleDefinitionRequest = {
      name: input.name.trim(),
      description: input.description.trim(),
      permissions: [...new Set(input.permissions)],
    };
    return this.runCommand(
      lease,
      () => this.api.updateRole(current.id, current.version, request),
      (value) => isRoleInScope(value, lease),
      "Role definition updated.",
    );
  }

  async deactivateRoleDefinition(role: RoleDefinitionResponse): Promise<boolean> {
    if (
      !this.canManageRoleDefinitions() ||
      role.type !== "CUSTOM" ||
      role.status !== "ACTIVE"
    ) {
      return false;
    }
    const lease = this.sessions.captureSessionLease();
    const current = this.state().roles.find((value) => value.id === role.id);
    if (
      !lease ||
      !current ||
      !isRoleInScope(current, lease) ||
      current.version !== role.version ||
      current.type !== "CUSTOM" ||
      current.tenantId !== lease.scope.tenantId ||
      current.workspaceId !== lease.scope.workspaceId ||
      current.status !== "ACTIVE"
    ) {
      this.setLocalError("Refresh the role definition before deactivating it.");
      return false;
    }
    return this.runCommand(
      lease,
      () => this.api.deactivateRole(current.id, current.version),
      (value) => isRoleInScope(value, lease),
      "Role definition deactivated.",
    );
  }

  canEditRoleDefinition(role: RoleDefinitionResponse): boolean {
    const lease = this.sessions.captureSessionLease();
    const current = this.state().roles.find((value) => value.id === role.id);
    return Boolean(
      this.canManageRoleDefinitions() &&
        lease &&
        current &&
        current.version === role.version &&
        current.type === "CUSTOM" &&
        current.status === "ACTIVE" &&
        current.tenantId === lease.scope.tenantId &&
        current.workspaceId === lease.scope.workspaceId,
    );
  }

  private async runCommand<T>(
    lease: PlatformSessionLease,
    operation: () => Observable<{ readonly body: T | null }>,
    validate: (value: T) => boolean,
    successNotice: string,
    onSuccess?: () => void,
  ): Promise<boolean> {
    if (this.commandPending() || !this.sessions.isSessionLeaseCurrent(lease)) {
      return false;
    }
    this.commandPending.set(true);
    this.clearMessages();
    try {
      const response = await firstValueFrom(operation());
      if (!this.sessions.isSessionLeaseCurrent(lease)) return false;
      if (!response.body || !validate(response.body)) {
        throw new Error("The API returned a resource outside the active scope.");
      }
      onSuccess?.();
      const invitationPage = this.state().invitations?.page ?? 0;
      await this.load(invitationPage);
      if (this.sessions.isSessionLeaseCurrent(lease)) {
        this.snapshot.update((state) => ({ ...state, notice: successNotice }));
      }
      return true;
    } catch (error) {
      if (this.invalidateSessionForError(lease, error)) return false;
      if (!this.sessions.isSessionLeaseCurrent(lease)) return false;
      if (this.sessions.isSessionLeaseCurrent(lease)) {
        this.snapshot.update((state) => ({
          ...state,
          status: state.status === "loading" ? "error" : state.status,
          message: safeFailureMessage(error, "command"),
        }));
      }
      return false;
    } finally {
      this.commandPending.set(false);
    }
  }

  private isCurrent(lease: PlatformSessionLease, version: number): boolean {
    return (
      this.loadVersion() === version &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private invalidateSessionForError(
    lease: PlatformSessionLease,
    error: unknown,
  ): boolean {
    if (!(error instanceof NexaApiError)) return false;
    const invalidated =
      error.kind === "unauthenticated"
        ? this.sessions.expireSessionIfCurrent(lease)
        : error.problem?.code?.trim().toUpperCase() ===
            "ACCESS_CONTEXT_INVALID"
          ? this.sessions.invalidateContextIfCurrent(lease)
          : false;
    if (invalidated) this.snapshot.set(EMPTY_STATE);
    return invalidated;
  }

  private hasPermission(permission: string): boolean {
    return Boolean(
      this.sessions.captureSessionLease() &&
        this.permissions().has(permission),
    );
  }

  private clearMessages(): void {
    this.snapshot.update((state) => ({ ...state, message: "", notice: "" }));
  }

  private setLocalError(message: string): void {
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    this.snapshot.update((state) =>
      this.sessions.isSessionLeaseCurrent(lease)
        ? { ...state, lease, message, notice: "" }
        : state,
    );
  }
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeInvitation(
  request: CreateInvitationRequest,
): CreateInvitationRequest | null {
  const email = request.email.trim();
  const displayName = request.displayName.trim();
  const roles = [...new Set(request.roles)];
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    displayName.length < 2 ||
    displayName.length > 120 ||
    roles.length === 0 ||
    roles.some((role) => !PLATFORM_INTERNAL_MEMBERSHIP_ROLES.includes(role))
  ) {
    return null;
  }
  return { email, displayName, roles };
}

async function invitationPayloadHash(
  request: CreateInvitationRequest,
): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const normalizedPayload = JSON.stringify({
    email: request.email.toLowerCase(),
    displayName: request.displayName,
    roles: [...request.roles].sort(),
  });
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizedPayload),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function invitationRetryStorageKey(
  lease: PlatformSessionLease,
  payloadHash: string,
): string {
  const scopeParts = [
    lease.scope.userId,
    lease.scope.tenantId,
    lease.scope.workspaceId,
    lease.scope.membershipId,
  ].map((part) => encodeURIComponent(part));
  return `nexa:platform:member-invitation:${scopeParts.join(":")}:${payloadHash}`;
}

function isUuid(value: string | null): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function validRoleInput(
  input: {
    readonly code: string;
    readonly name: string;
    readonly description: string;
    readonly permissions: readonly string[];
  },
  catalog: readonly PermissionCatalogEntryResponse[],
): boolean {
  const catalogCodes = new Set(catalog.map((value) => value.code));
  return (
    /^[A-Z][A-Z0-9_]{1,49}$/.test(input.code.trim().toUpperCase()) &&
    input.name.trim().length >= 2 &&
    input.name.trim().length <= 120 &&
    input.description.trim().length <= 500 &&
    input.permissions.length > 0 &&
    input.permissions.every((value) => catalogCodes.has(value))
  );
}

function requireScopedList<T>(
  value: readonly T[],
  valid: (item: T) => boolean,
  label: string,
): readonly T[] {
  if (!Array.isArray(value) || value.some((item) => !valid(item))) {
    throw new Error(`The API returned an invalid or out-of-scope ${label} list.`);
  }
  return value;
}

function requireInvitationPage(
  value: InvitationPageResponse,
  requestedPage: number,
  lease: PlatformSessionLease,
): InvitationPageResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.page !== requestedPage ||
    !Number.isSafeInteger(value.pageSize) ||
    value.pageSize < 1 ||
    value.pageSize > 100 ||
    typeof value.hasNext !== "boolean" ||
    value.items.some((item) => !isInvitationInScope(item, lease))
  ) {
    throw new Error("The API returned an invalid or out-of-scope invitation page.");
  }
  return value;
}

function requirePermissionCatalog(
  value: readonly PermissionCatalogEntryResponse[],
): readonly PermissionCatalogEntryResponse[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        !isRecord(entry) ||
        !isNonEmptyString(entry["code"]) ||
        !isNonEmptyString(entry["group"]) ||
        !Array.isArray(entry["legacyCodes"]),
    )
  ) {
    throw new Error("The API returned an invalid permission catalog.");
  }
  return value;
}

function isAllowedMembershipTransition(
  action: "suspend" | "reactivate" | "revoke",
  status: string,
): boolean {
  const normalized = status.toUpperCase();
  if (action === "suspend") return normalized === "ACTIVE";
  if (action === "reactivate") return normalized === "SUSPENDED";
  return normalized === "ACTIVE" || normalized === "SUSPENDED";
}

function isAssignableRoleDefinition(
  role: RoleDefinitionResponse,
  lease: PlatformSessionLease,
): boolean {
  if (
    role.status !== "ACTIVE" ||
    ["BUYER", "SYSTEM_WORKFLOW"].includes(role.code.trim().toUpperCase())
  ) return false;
  if (role.type !== "CUSTOM") return true;
  return (
    role.tenantId === lease.scope.tenantId &&
    role.workspaceId === lease.scope.workspaceId
  );
}

function isMembershipInScope(
  value: WorkspaceMembershipResponse,
  lease: PlatformSessionLease,
): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    value.workspaceId === lease.scope.workspaceId &&
    ["INTERNAL", "BUYER", "SYSTEM_WORKFLOW"].includes(value.membershipType) &&
    isNonEmptyString(value.email) &&
    isNonEmptyString(value.displayName) &&
    Number.isSafeInteger(value.version) &&
    Array.isArray(value.roles) &&
    Array.isArray(value.roleDefinitionIds) &&
    Array.isArray(value.permissionCodes)
  );
}

function isInternalMembership(value: WorkspaceMembershipResponse): boolean {
  return value.membershipType === "INTERNAL";
}

function isInternalMembershipInScope(
  value: WorkspaceMembershipResponse,
  lease: PlatformSessionLease,
): boolean {
  return isMembershipInScope(value, lease) && isInternalMembership(value);
}

function isInvitationInScope(
  value: InvitationResponse,
  lease: PlatformSessionLease,
): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    value.workspaceId === lease.scope.workspaceId &&
    isNonEmptyString(value.email) &&
    isNonEmptyString(value.displayName) &&
    Number.isSafeInteger(value.version) &&
    Array.isArray(value.roles) &&
    isNonEmptyString(value.status) &&
    isNonEmptyString(value.expiresAt) &&
    isNonEmptyString(value.createdAt)
  );
}

function isRoleInScope(
  value: RoleDefinitionResponse,
  lease: PlatformSessionLease,
): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    (value.tenantId === null || value.tenantId === lease.scope.tenantId) &&
    (value.workspaceId === null ||
      value.workspaceId === lease.scope.workspaceId) &&
    ["SYSTEM_RESERVED", "SYSTEM_TEMPLATE", "CUSTOM"].includes(value.type) &&
    isNonEmptyString(value.code) &&
    isNonEmptyString(value.name) &&
    ["ACTIVE", "INACTIVE"].includes(value.status) &&
    Array.isArray(value.permissions) &&
    Number.isSafeInteger(value.version)
  );
}

function safeFailureMessage(
  error: unknown,
  action: "load" | "command",
): string {
  if (!(error instanceof NexaApiError)) {
    return action === "load"
      ? "Tenant access data could not be validated. Refresh and try again."
      : "The change could not be verified. Refresh before retrying.";
  }
  switch (error.kind) {
    case "network":
    case "timeout":
      return "The API could not be reached. Check the connection and try again.";
    case "unauthenticated":
      return "Your session has expired. Sign in again to continue.";
    case "forbidden":
      return "The API denied this request for the active membership.";
    case "not-found":
      return "The requested Tenant access record is no longer available.";
    case "conflict":
    case "precondition":
      return "The record changed or the operation conflicts with current state. Refresh and retry.";
    case "validation":
      return "The API rejected the submitted Tenant access data. Review it and try again.";
    default:
      return action === "load"
        ? "Tenant access data could not be loaded. Try again."
        : "The change could not be completed. Try again.";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
