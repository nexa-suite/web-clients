import { signal } from "@angular/core";
import type { WritableSignal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NexaApiError } from "@nexa/api";
import type {
  CreateInvitationRequest,
  InvitationPageResponse,
  InvitationResponse,
  PermissionCatalogEntryResponse,
  RoleDefinitionResponse,
  WorkspaceMembershipResponse,
} from "@nexa/api";
import { NexaCommandRetryStore, NexaTenantAccessGovernanceApi } from "@nexa/api";
import { Subject, of, throwError } from "rxjs";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
  type PlatformSessionState,
} from "./platform-session.store";
import { PlatformTenantAccessGovernanceStore } from "./platform-tenant-access-governance.store";

describe("PlatformTenantAccessGovernanceStore", () => {
  const lease: PlatformSessionLease = {
    epoch: 4,
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-actor",
      surface: "PLATFORM",
    },
  };

  let store: PlatformTenantAccessGovernanceStore;
  let api: ReturnType<typeof createApi>;
  let validLease: WritableSignal<boolean>;
  let activeLease: WritableSignal<PlatformSessionLease | null>;
  let retryValues: Map<string, string>;
  let sessionHarness: {
    state: WritableSignal<PlatformSessionState>;
    captureSessionLease: ReturnType<typeof vi.fn>;
    isSessionLeaseCurrent: ReturnType<typeof vi.fn>;
    expireSessionIfCurrent: ReturnType<typeof vi.fn>;
    invalidateContextIfCurrent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    validLease = signal(true);
    activeLease = signal<PlatformSessionLease | null>(lease);
    retryValues = new Map();
    api = createApi();
    sessionHarness = {
      state: signal<PlatformSessionState>({
        status: "authenticated",
        session: {
          user: { userId: "user-1" },
          tenant: { tenantId: "tenant-1" },
          workspace: { workspaceId: "workspace-1" },
          membership: {
            membershipId: "membership-actor",
            roles: ["TENANT_ADMIN"],
            permissions: [
              "tenant.member.read",
              "tenant.member.invite",
              "tenant.member.manage",
              "tenant.role.read",
              "tenant.role.manage",
              "tenant.role.assign",
              "tenant.role.assign_reserved",
            ],
          },
          surface: "PLATFORM",
        },
      }),
      captureSessionLease: vi.fn(() =>
        validLease() ? activeLease() : null,
      ),
      isSessionLeaseCurrent: vi.fn((candidate: PlatformSessionLease) =>
        validLease() && candidate === activeLease(),
      ),
      expireSessionIfCurrent: vi.fn((candidate: PlatformSessionLease) => {
        if (!validLease() || candidate !== activeLease()) return false;
        validLease.set(false);
        activeLease.set(null);
        sessionHarness.state.set({ status: "unauthenticated" });
        return true;
      }),
      invalidateContextIfCurrent: vi.fn((candidate: PlatformSessionLease) => {
        if (!validLease() || candidate !== activeLease()) return false;
        validLease.set(false);
        activeLease.set(null);
        sessionHarness.state.set({ status: "unauthenticated" });
        return true;
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        PlatformTenantAccessGovernanceStore,
        { provide: NexaTenantAccessGovernanceApi, useValue: api },
        { provide: PlatformSessionStore, useValue: sessionHarness },
        {
          provide: NexaCommandRetryStore,
          useValue: {
            read: vi.fn((key: string) => retryValues.get(key) ?? null),
            write: vi.fn((key: string, value: string) => retryValues.set(key, value)),
            remove: vi.fn((key: string) => retryValues.delete(key)),
          },
        },
      ],
    });
    store = TestBed.inject(PlatformTenantAccessGovernanceStore);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("allows read and Tenant Administrator commands only with exact typed grants", () => {
    expect(store.canReadMembers()).toBe(true);
    expect(store.canReadRoles()).toBe(true);
    expect(store.canInviteMembers()).toBe(true);
    expect(store.canManageMemberships()).toBe(true);
    expect(store.canAssignRoles()).toBe(true);
    expect(store.canManageRoleDefinitions()).toBe(true);
  });

  it("keeps Company Owner oversight read-only even when AS-IS permissions include writes", () => {
    sessionHarness.state.set({
      status: "authenticated",
      session: {
        membership: {
          roles: ["COMPANY_OWNER"],
          permissions: [
            "tenant.member.read",
            "tenant.member.invite",
            "tenant.member.manage",
            "tenant.role.read",
            "tenant.role.assign",
            "tenant.role.manage",
          ],
        },
      },
    });

    expect(store.isCompanyOwner()).toBe(true);
    expect(store.canReadMembers()).toBe(true);
    expect(store.canReadRoles()).toBe(true);
    expect(store.canInviteMembers()).toBe(false);
    expect(store.canManageMemberships()).toBe(false);
    expect(store.canAssignRoles()).toBe(false);
    expect(store.canManageRoleDefinitions()).toBe(false);
  });

  it("uses exact custom-role read and membership-management grants without inventing invite or role authority", () => {
    sessionHarness.state.set({
      status: "authenticated",
      session: {
        membership: {
          roles: ["WORKSPACE_AUDITOR"],
          permissions: [
            "tenant.member.read",
            "tenant.member.manage",
            "tenant.role.read",
          ],
        },
      },
    });

    expect(store.canReadMembers()).toBe(true);
    expect(store.canReadRoles()).toBe(true);
    expect(store.canManageMemberships()).toBe(true);
    expect(store.canInviteMembers()).toBe(false);
    expect(store.canAssignRoles()).toBe(false);
    expect(store.canManageRoleDefinitions()).toBe(false);
  });

  it("loads only active-context lists and fails closed on a mismatched Workspace record", async () => {
    api.listMemberships.mockReturnValue(of([membership()]));
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([role()]));
    api.listPermissionCatalog.mockReturnValue(
      of([{ code: "sales.purchase_request.read", group: "SALES", legacyCodes: [] }]),
    );

    await store.load();

    expect(api.listMemberships).toHaveBeenCalledWith();
    expect(api.listInvitations).toHaveBeenCalledWith(0, 25);
    expect(api.listRoles).toHaveBeenCalledWith();
    expect(store.state().status).toBe("ready");
    expect(store.state().memberships).toEqual([membership()]);

    api.listMemberships.mockReturnValue(
      of([membership({ workspaceId: "workspace-other" })]),
    );
    await store.load();
    expect(store.state().status).toBe("error");
    expect(store.state().memberships).toEqual([]);
    expect(store.state().message).toBe(
      "Tenant access data could not be validated. Refresh and try again.",
    );
  });

  it("keeps SYSTEM_WORKFLOW out of the human directory and role assignment commands", async () => {
    const systemWorkflowMembership = membership({
      id: "workflow-membership",
      userId: "11111111-1111-4111-8111-111111111111",
      membershipType: "SYSTEM_WORKFLOW",
      email: "nexa-automation@system.invalid",
      displayName: "NEXA_AUTOMATION",
      roles: ["system_workflow"],
      roleDefinitionIds: ["22222222-2222-4222-8222-222222222222"],
    });
    api.listMemberships.mockReturnValue(of([membership(), systemWorkflowMembership]));
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([
      role(),
      role({
        id: "22222222-2222-4222-8222-222222222222",
        tenantId: null,
        workspaceId: null,
        type: "SYSTEM_RESERVED",
        code: "system_workflow",
      }),
    ]));
    api.listPermissionCatalog.mockReturnValue(of([]));

    await store.load();

    expect(store.state().memberships).toEqual([membership()]);
    expect(store.assignableRoleDefinitions().map((value) => value.code)).not.toContain(
      "system_workflow",
    );
    expect(
      await store.assignMembershipRoles(
        "membership-1",
        3,
        ["22222222-2222-4222-8222-222222222222"],
      ),
    ).toBe(false);
    expect(await store.changeMembershipStatus("suspend", systemWorkflowMembership)).toBe(false);
    expect(api.updateMembershipRoleDefinitions).not.toHaveBeenCalled();
    expect(api.suspendMembership).not.toHaveBeenCalled();
  });

  it("masks a pending query when its session lease becomes stale", async () => {
    const memberships = new Subject<readonly WorkspaceMembershipResponse[]>();
    api.listMemberships.mockReturnValue(memberships.asObservable());
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([role()]));
    api.listPermissionCatalog.mockReturnValue(of([]));

    const loading = store.load();
    expect(store.state().status).toBe("loading");
    activeLease.set(null);
    memberships.next([membership()]);
    memberships.complete();
    await loading;

    expect(store.state().status).toBe("idle");
    expect(store.state().memberships).toEqual([]);
  });

  it("expires the current session and clears the BC01 snapshot after a 401", async () => {
    api.listMemberships.mockReturnValue(of([membership()]));
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([role()]));
    api.listPermissionCatalog.mockReturnValue(of([]));
    await store.load();
    expect(store.state().memberships).toHaveLength(1);

    api.listMemberships.mockReturnValue(
      throwError(() => new NexaApiError("unauthenticated", 401, null)),
    );
    await store.load();

    expect(sessionHarness.expireSessionIfCurrent).toHaveBeenCalledWith(lease);
    expect(sessionHarness.invalidateContextIfCurrent).not.toHaveBeenCalled();
    expect(store.state().memberships).toEqual([]);
    expect(store.state().status).toBe("idle");
  });

  it("invalidates the current access context and clears loaded metadata on ACCESS_CONTEXT_INVALID", async () => {
    api.listMemberships.mockReturnValue(of([membership()]));
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([role()]));
    api.listPermissionCatalog.mockReturnValue(of([]));
    await store.load();
    expect(store.state().roles).toHaveLength(1);

    api.listRoles.mockReturnValue(
      throwError(
        () =>
          new NexaApiError("forbidden", 403, { code: "ACCESS_CONTEXT_INVALID" }),
      ),
    );
    await store.load();

    expect(sessionHarness.invalidateContextIfCurrent).toHaveBeenCalledWith(lease);
    expect(sessionHarness.expireSessionIfCurrent).not.toHaveBeenCalled();
    expect(store.state().roles).toEqual([]);
    expect(store.state().status).toBe("idle");
  });

  it("clears the current access context when a membership command reports ACCESS_CONTEXT_INVALID", async () => {
    api.listMemberships.mockReturnValue(of([membership()]));
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([role()]));
    api.listPermissionCatalog.mockReturnValue(of([]));
    await store.load();
    expect(store.state().memberships).toHaveLength(1);

    api.suspendMembership.mockReturnValue(
      throwError(
        () =>
          new NexaApiError("forbidden", 403, {
            code: "ACCESS_CONTEXT_INVALID",
          }),
      ),
    );
    const result = await store.changeMembershipStatus("suspend", membership());

    expect(result).toBe(false);
    expect(sessionHarness.invalidateContextIfCurrent).toHaveBeenCalledWith(lease);
    expect(store.state()).toMatchObject({ status: "idle", memberships: [], roles: [] });
  });

  it("does not expire a replacement session when a membership command returns a late 401", async () => {
    api.listMemberships.mockReturnValue(of([membership()]));
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([role()]));
    api.listPermissionCatalog.mockReturnValue(of([]));
    await store.load();
    const suspended = new Subject<{ readonly body: WorkspaceMembershipResponse }>();
    api.suspendMembership.mockReturnValue(suspended.asObservable());

    const command = store.changeMembershipStatus("suspend", membership());
    const replacementLease: PlatformSessionLease = {
      epoch: 5,
      scope: {
        ...lease.scope,
        userId: "user-2",
        tenantId: "tenant-2",
        workspaceId: "workspace-2",
        membershipId: "membership-new",
      },
    };
    activeLease.set(replacementLease);
    suspended.error(new NexaApiError("unauthenticated", 401, null));

    expect(await command).toBe(false);
    expect(sessionHarness.expireSessionIfCurrent).toHaveBeenCalledWith(lease);
    expect(sessionHarness.expireSessionIfCurrent).toHaveReturnedWith(false);
    expect(activeLease()).toBe(replacementLease);
  });

  it("does not expire a newer session when a late 401 arrives for the previous lease", async () => {
    const memberships = new Subject<readonly WorkspaceMembershipResponse[]>();
    api.listMemberships.mockReturnValue(memberships.asObservable());
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([role()]));
    api.listPermissionCatalog.mockReturnValue(of([]));
    const loading = store.load();
    const replacementLease: PlatformSessionLease = {
      epoch: 5,
      scope: {
        ...lease.scope,
        userId: "user-2",
        tenantId: "tenant-2",
        workspaceId: "workspace-2",
        membershipId: "membership-new",
      },
    };
    activeLease.set(replacementLease);
    memberships.error(new NexaApiError("unauthenticated", 401, null));
    await loading;

    expect(sessionHarness.expireSessionIfCurrent).toHaveBeenCalledWith(lease);
    expect(sessionHarness.expireSessionIfCurrent).toHaveReturnedWith(false);
    expect(activeLease()).toBe(replacementLease);
  });

  it("reuses the invitation idempotency key after an uncertain network outcome", async () => {
    api.createInvitation
      .mockReturnValueOnce(
        throwError(() => new NexaApiError("network", 0, null)),
      )
      .mockReturnValue(of({ body: invitation() }));
    api.listMemberships.mockReturnValue(of([membership()]));
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([role()]));
    api.listPermissionCatalog.mockReturnValue(of([]));
    vi.stubGlobal(
      "crypto",
      {
        randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
        subtle: {
          digest: async () => new Uint8Array(32).buffer,
        },
      } as unknown as Crypto,
    );

    const request = {
      email: "teammate@example.test",
      displayName: "New teammate",
      roles: ["SALES"] as const,
    };
    expect(await store.inviteMember(request)).toBe(false);
    const retryStorageKey = [...retryValues.keys()][0];
    expect(retryStorageKey).toMatch(
      /^nexa:platform:member-invitation:user-1:tenant-1:workspace-1:membership-actor:[0-9a-f]{64}$/,
    );
    expect(retryStorageKey).not.toContain("teammate@example.test");
    const persistedRetryKey = retryValues.get(retryStorageKey);
    expect(await store.inviteMember(request)).toBe(true);

    const firstKey = api.createInvitation.mock.calls[0][1];
    const retryKey = api.createInvitation.mock.calls[1][1];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(retryKey).toBe(firstKey);
    expect(persistedRetryKey).toBe(firstKey);
    expect(retryValues.has(retryStorageKey)).toBe(false);
  });

  it("takes the new role Workspace from the active lease and catalog", async () => {
    api.listMemberships.mockReturnValue(of([membership()]));
    api.listInvitations.mockReturnValue(of(invitationPage()));
    api.listRoles.mockReturnValue(of([role()]));
    api.listPermissionCatalog.mockReturnValue(
      of([{ code: "sales.purchase_request.read", group: "SALES", legacyCodes: [] }]),
    );
    api.createRole.mockReturnValue(
      of({ body: role({ id: "role-created", code: "CUSTOM_REVIEW" }) }),
    );
    await store.load();

    const result = await store.createRoleDefinition({
      code: "CUSTOM_REVIEW",
      name: "Custom review",
      description: "Sales request review",
      permissions: ["sales.purchase_request.read"],
    });

    expect(result).toBe(true);
    expect(api.createRole).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    );
  });
});

function createApi() {
  return {
    listMemberships: vi.fn(() => of([] as readonly WorkspaceMembershipResponse[])),
    listInvitations: vi.fn(() => of(invitationPage())),
    listRoles: vi.fn(() => of([role()] as readonly RoleDefinitionResponse[])),
    listPermissionCatalog: vi.fn(
      () => of([] as readonly PermissionCatalogEntryResponse[]),
    ),
    createInvitation: vi.fn(
      (_request: CreateInvitationRequest, _key: string) =>
        of({ body: invitation() }),
    ),
    updateMembershipRoleDefinitions: vi.fn(() =>
      of({ body: membership() }),
    ),
    suspendMembership: vi.fn(() => of({ body: membership() })),
    reactivateMembership: vi.fn(() => of({ body: membership() })),
    revokeMembership: vi.fn(() => of({ body: membership() })),
    resendInvitation: vi.fn(() => of({ body: invitation() })),
    revokeInvitation: vi.fn(() => of({ body: invitation() })),
    createRole: vi.fn(() => of({ body: role() })),
    updateRole: vi.fn(() => of({ body: role() })),
    deactivateRole: vi.fn(() => of({ body: role() })),
  };
}

function membership(
  overrides: Partial<WorkspaceMembershipResponse> = {},
): WorkspaceMembershipResponse {
  return {
    id: "membership-1",
    workspaceId: "workspace-1",
    userId: "user-2",
    membershipType: "INTERNAL",
    email: "person@example.test",
    displayName: "A Person",
    status: "ACTIVE",
    version: 3,
    roles: ["SALES"],
    roleDefinitionIds: ["role-sales"],
    permissionCodes: ["sales.purchase_request.read"],
    ...overrides,
  };
}

function invitation(
  overrides: Partial<InvitationResponse> = {},
): InvitationResponse {
  return {
    id: "invitation-1",
    workspaceId: "workspace-1",
    email: "invitee@example.test",
    displayName: "Invitee",
    roles: ["SALES"],
    status: "PENDING",
    expiresAt: "2026-10-15T00:00:00Z",
    version: 2,
    createdAt: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

function invitationPage(): InvitationPageResponse {
  return { items: [invitation()], page: 0, pageSize: 25, hasNext: false };
}

function role(
  overrides: Partial<RoleDefinitionResponse> = {},
): RoleDefinitionResponse {
  return {
    id: "role-sales",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    type: "CUSTOM",
    code: "SALES_REVIEW",
    name: "Sales review",
    description: "Sales request review",
    permissions: ["sales.purchase_request.read"],
    status: "ACTIVE",
    createdBy: "user-1",
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
    version: 1,
    ...overrides,
  };
}
