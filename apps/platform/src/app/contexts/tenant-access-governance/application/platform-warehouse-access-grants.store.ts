import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
} from "@angular/core";
import { firstValueFrom } from "rxjs";
import {
  NexaTenantAccessGovernanceApi,
  NexaWarehouseAccessGrantsApi,
  type WarehouseAccessGrantResponse,
  type WarehousePageResponse,
  type WarehouseResponse,
  type WorkspaceMembershipResponse,
} from "@nexa/api";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "./platform-session.store";

const WORKFLOW_ROLE = "system_workflow";
const WORKFLOW_USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKFLOW_ROLE_ID = "22222222-2222-4222-8222-222222222222";
const WORKFLOW_EMAIL = "nexa-automation@system.invalid";
const WAREHOUSE_PAGE_SIZE = 100;

export type PlatformWarehouseAccessGrantsState =
  | { readonly status: "idle" }
  | {
      readonly status: "loading";
      readonly lease: PlatformSessionLease;
      readonly page: number;
    }
  | {
      readonly status: "error";
      readonly lease: PlatformSessionLease | null;
      readonly message: string;
    }
  | {
      readonly status: "ready";
      readonly lease: PlatformSessionLease;
      readonly warehouses: WarehousePageResponse;
      readonly systemActor: WorkspaceMembershipResponse | null;
      readonly actorIssue: string;
      readonly selectedWarehouseId: string | null;
      readonly grantsStatus: "idle" | "loading" | "ready" | "error";
      readonly selectedGrant: WarehouseAccessGrantResponse | null;
      readonly busy: boolean;
      readonly needsRefresh: boolean;
      readonly message: string;
      readonly notice: string;
    };

const EMPTY_STATE: PlatformWarehouseAccessGrantsState = { status: "idle" };

/** Owns the explicit SYSTEM_WORKFLOW grant panel, fenced to the active server lease. */
@Injectable()
export class PlatformWarehouseAccessGrantsStore {
  private readonly membershipsApi = inject(NexaTenantAccessGovernanceApi);
  private readonly grantsApi = inject(NexaWarehouseAccessGrantsApi);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snapshot =
    signal<PlatformWarehouseAccessGrantsState>(EMPTY_STATE);
  private readonly generation = signal(0);
  private observedScope = "";
  private observedAuthorization = false;

  readonly state = computed<PlatformWarehouseAccessGrantsState>(() => {
    const current = this.snapshot();
    if (current.status === "idle") return current;
    if (current.lease && this.sessions.isSessionLeaseCurrent(current.lease))
      return current;
    return {
      status: "error",
      lease: current.lease,
      message:
        "The active Tenant or Workspace changed. Reload this page before editing grants.",
    };
  });

  readonly canManage = computed(() => {
    const current = this.sessions.state();
    if (
      current.status !== "authenticated" ||
      current.session.surface !== "PLATFORM"
    )
      return false;
    const roles = new Set(current.session.membership?.roles ?? []);
    const permissions = new Set(
      (current.session.membership?.permissions ?? []).map(normalizeCode),
    );
    return (
      (roles.has("COMPANY_OWNER") || roles.has("TENANT_ADMIN")) &&
      permissions.has("tenant.role.assign") &&
      this.sessions.captureSessionLease() !== null
    );
  });

  constructor() {
    this.destroyRef.onDestroy(() =>
      this.generation.update((value) => value + 1),
    );
    effect(() => {
      const lease = this.sessions.captureSessionLease();
      const authorized = this.canManage();
      const scope = lease
        ? `${lease.epoch}:${lease.scope.userId}:${lease.scope.tenantId}:${lease.scope.workspaceId}:${lease.scope.membershipId}`
        : "no-active-scope";
      if (
        scope === this.observedScope &&
        authorized === this.observedAuthorization
      )
        return;
      this.observedScope = scope;
      this.observedAuthorization = authorized;
      const generation = this.generation() + 1;
      this.generation.set(generation);
      this.snapshot.set(EMPTY_STATE);
      if (lease && authorized) void this.loadPage(0, lease, generation);
    });
  }

  refresh(): void {
    const current = this.state();
    if (!this.canManage() || current.status === "loading") return;
    if (current.status === "ready" && current.busy) return;
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    this.startPageLoad(
      current.status === "ready" ? current.warehouses.page : 0,
      lease,
    );
  }

  changePage(offset: number): void {
    const current = this.state();
    if (current.status !== "ready" || current.busy || !this.canManage()) return;
    const nextPage = current.warehouses.page + offset;
    const lastPage = Math.max(
      0,
      Math.ceil(current.warehouses.total / current.warehouses.size) - 1,
    );
    if (!Number.isSafeInteger(offset) || nextPage < 0 || nextPage > lastPage)
      return;
    this.startPageLoad(nextPage, current.lease);
  }

  selectWarehouse(warehouseId: string): void {
    const current = this.state();
    if (current.status !== "ready" || current.busy || !this.canManage()) return;
    if (warehouseId === "") {
      this.generation.update((value) => value + 1);
      this.snapshot.set({
        ...current,
        selectedWarehouseId: null,
        grantsStatus: "idle",
        selectedGrant: null,
        busy: false,
        needsRefresh: false,
        message: "",
        notice: "",
      });
      return;
    }
    const warehouse = current.warehouses.items.find(
      (item) => item.id === warehouseId,
    );
    if (!warehouse) return;
    const generation = this.generation() + 1;
    this.generation.set(generation);
    this.snapshot.set({
      ...current,
      selectedWarehouseId: warehouse.id,
      grantsStatus: current.systemActor ? "loading" : "idle",
      selectedGrant: null,
      busy: false,
      needsRefresh: false,
      message: "",
      notice: "",
    });
    if (current.systemActor)
      void this.loadGrant(
        current.lease,
        generation,
        warehouse.id,
        current.systemActor,
      );
  }

  canGrant(): boolean {
    const current = this.state();
    return (
      current.status === "ready" &&
      this.canManage() &&
      current.systemActor !== null &&
      current.selectedWarehouseId !== null &&
      current.grantsStatus === "ready" &&
      !current.busy &&
      !current.needsRefresh &&
      (current.selectedGrant === null ||
        current.selectedGrant.status === "REVOKED")
    );
  }

  canRevoke(): boolean {
    const current = this.state();
    return (
      current.status === "ready" &&
      this.canManage() &&
      current.systemActor !== null &&
      current.selectedWarehouseId !== null &&
      current.grantsStatus === "ready" &&
      !current.busy &&
      !current.needsRefresh &&
      current.selectedGrant?.status === "ACTIVE"
    );
  }

  async grant(): Promise<void> {
    const current = this.state();
    if (
      !this.canGrant() ||
      current.status !== "ready" ||
      !current.systemActor ||
      !current.selectedWarehouseId
    )
      return;
    const generation = this.generation();
    const warehouseId = current.selectedWarehouseId;
    const actor = current.systemActor;
    const expectedVersion =
      current.selectedGrant?.status === "REVOKED"
        ? current.selectedGrant.version
        : undefined;
    this.setBusy(current, true);
    try {
      const response = await firstValueFrom(
        this.grantsApi.grantAccess(warehouseId, actor.id, expectedVersion),
      );
      if (!this.isCurrent(current.lease, generation)) return;
      validateGrant(
        response.body,
        current.lease,
        warehouseId,
        actor.id,
        "ACTIVE",
        expectedVersion,
      );
      this.setAfterCommand(
        current.lease,
        warehouseId,
        actor,
        generation,
        expectedVersion === undefined
          ? "Warehouse access granted."
          : "Warehouse access reactivated.",
      );
    } catch {
      if (!this.isCurrent(current.lease, generation)) return;
      this.markNeedsRefresh(
        current.lease,
        "The grant result could not be confirmed. Refresh before another change.",
      );
    }
  }

  async revoke(): Promise<void> {
    const current = this.state();
    if (
      !this.canRevoke() ||
      current.status !== "ready" ||
      !current.systemActor ||
      !current.selectedWarehouseId ||
      !current.selectedGrant
    )
      return;
    const generation = this.generation();
    const warehouseId = current.selectedWarehouseId;
    const actor = current.systemActor;
    const expectedVersion = current.selectedGrant.version;
    this.setBusy(current, true);
    try {
      const response = await firstValueFrom(
        this.grantsApi.revokeAccess(warehouseId, actor.id, expectedVersion),
      );
      if (!this.isCurrent(current.lease, generation)) return;
      validateGrant(
        response.body,
        current.lease,
        warehouseId,
        actor.id,
        "REVOKED",
        expectedVersion,
      );
      this.setAfterCommand(
        current.lease,
        warehouseId,
        actor,
        generation,
        "Warehouse access revoked.",
      );
    } catch {
      if (!this.isCurrent(current.lease, generation)) return;
      this.markNeedsRefresh(
        current.lease,
        "The revocation result could not be confirmed. Refresh before another change.",
      );
    }
  }

  private startPageLoad(page: number, lease: PlatformSessionLease): void {
    const generation = this.generation() + 1;
    this.generation.set(generation);
    void this.loadPage(page, lease, generation);
  }

  private async loadPage(
    page: number,
    lease: PlatformSessionLease,
    generation: number,
  ): Promise<void> {
    this.snapshot.set({ status: "loading", lease, page });
    try {
      const [warehouses, memberships] = await Promise.all([
        firstValueFrom(
          this.grantsApi.listWarehouses(page, WAREHOUSE_PAGE_SIZE),
        ),
        firstValueFrom(this.membershipsApi.listMemberships()),
      ]);
      if (!this.isCurrent(lease, generation)) return;
      validateWarehousePage(warehouses, page);
      validateMemberships(memberships, lease);
      const systemMemberships = memberships.filter(
        (membership) => membership.membershipType === "SYSTEM_WORKFLOW",
      );
      const verifiedActors = systemMemberships.filter(isVerifiedSystemActor);
      const actorIssue =
        systemMemberships.length !== 1 || verifiedActors.length !== 1
          ? "The active NEXA_AUTOMATION SYSTEM_WORKFLOW membership is missing or ambiguous. No grant changes are available."
          : "";
      this.snapshot.set({
        status: "ready",
        lease,
        warehouses,
        systemActor: actorIssue ? null : verifiedActors[0],
        actorIssue,
        selectedWarehouseId: null,
        grantsStatus: "idle",
        selectedGrant: null,
        busy: false,
        needsRefresh: false,
        message: "",
        notice: "",
      });
    } catch {
      if (!this.isCurrent(lease, generation)) return;
      this.snapshot.set({
        status: "error",
        lease,
        message:
          "Warehouses or active workspace memberships could not be verified. Refresh to retry.",
      });
    }
  }

  private async loadGrant(
    lease: PlatformSessionLease,
    generation: number,
    warehouseId: string,
    actor: WorkspaceMembershipResponse,
  ): Promise<void> {
    try {
      const grants = await firstValueFrom(
        this.grantsApi.listAccessGrants(warehouseId),
      );
      if (!this.isCurrent(lease, generation)) return;
      validateGrants(grants, lease, warehouseId);
      const actorGrants = grants.filter(
        (grant) => grant.membershipId === actor.id,
      );
      if (actorGrants.length > 1)
        throw new Error("Duplicate actor grants returned.");
      const current = this.state();
      if (
        current.status !== "ready" ||
        current.selectedWarehouseId !== warehouseId
      )
        return;
      this.snapshot.set({
        ...current,
        grantsStatus: "ready",
        selectedGrant: actorGrants[0] ?? null,
        needsRefresh: false,
        message: "",
      });
    } catch {
      if (!this.isCurrent(lease, generation)) return;
      const current = this.state();
      if (
        current.status !== "ready" ||
        current.selectedWarehouseId !== warehouseId
      )
        return;
      this.snapshot.set({
        ...current,
        grantsStatus: "error",
        selectedGrant: null,
        needsRefresh: true,
        message:
          "Warehouse grants could not be verified. Refresh before changing access.",
      });
    }
  }

  private setBusy(
    current: Extract<PlatformWarehouseAccessGrantsState, { status: "ready" }>,
    busy: boolean,
  ): void {
    this.snapshot.set({ ...current, busy, message: "", notice: "" });
  }

  private setAfterCommand(
    lease: PlatformSessionLease,
    warehouseId: string,
    actor: WorkspaceMembershipResponse,
    generation: number,
    notice: string,
  ): void {
    if (!this.isCurrent(lease, generation)) return;
    const current = this.state();
    if (
      current.status !== "ready" ||
      current.selectedWarehouseId !== warehouseId
    )
      return;
    this.snapshot.set({
      ...current,
      busy: false,
      grantsStatus: "loading",
      notice,
    });
    void this.loadGrant(lease, generation, warehouseId, actor);
  }

  private markNeedsRefresh(lease: PlatformSessionLease, message: string): void {
    const current = this.state();
    if (
      current.status !== "ready" ||
      !this.sessions.isSessionLeaseCurrent(lease)
    )
      return;
    this.snapshot.set({
      ...current,
      busy: false,
      grantsStatus: "error",
      needsRefresh: true,
      message,
      notice: "",
    });
  }

  private isCurrent(lease: PlatformSessionLease, generation: number): boolean {
    return (
      this.generation() === generation &&
      this.canManage() &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }
}

function validateWarehousePage(
  value: WarehousePageResponse,
  expectedPage: number,
): void {
  if (
    !isRecord(value) ||
    value["page"] !== expectedPage ||
    value["size"] !== WAREHOUSE_PAGE_SIZE ||
    !Number.isSafeInteger(value["total"]) ||
    Number(value["total"]) < 0 ||
    !Array.isArray(value["items"]) ||
    value["items"].length > WAREHOUSE_PAGE_SIZE ||
    value["items"].length > Number(value["total"])
  ) {
    throw new Error("Warehouse page response does not match the request.");
  }
  const ids = new Set<string>();
  for (const warehouse of value["items"] as readonly unknown[]) {
    if (!isWarehouse(warehouse) || ids.has(warehouse.id)) {
      throw new Error(
        "Warehouse page contains an invalid or duplicate Warehouse.",
      );
    }
    ids.add(warehouse.id);
  }
}

function validateMemberships(
  value: readonly WorkspaceMembershipResponse[],
  lease: PlatformSessionLease,
): void {
  if (!Array.isArray(value))
    throw new Error("Workspace membership response is invalid.");
  const ids = new Set<string>();
  for (const membership of value as readonly unknown[]) {
    if (!isWorkspaceMembership(membership, lease) || ids.has(membership.id)) {
      throw new Error(
        "Workspace memberships are not scoped to the current Workspace.",
      );
    }
    ids.add(membership.id);
  }
}

function isVerifiedSystemActor(
  membership: WorkspaceMembershipResponse,
): boolean {
  return (
    membership.userId === WORKFLOW_USER_ID &&
    membership.email.trim().toLowerCase() === WORKFLOW_EMAIL &&
    membership.displayName.trim() === "NEXA_AUTOMATION" &&
    membership.membershipType === "SYSTEM_WORKFLOW" &&
    membership.status.toUpperCase() === "ACTIVE" &&
    membership.roles.some((role) => normalizeCode(role) === WORKFLOW_ROLE) &&
    membership.roleDefinitionIds.includes(WORKFLOW_ROLE_ID)
  );
}

function validateGrants(
  grants: readonly WarehouseAccessGrantResponse[],
  lease: PlatformSessionLease,
  warehouseId: string,
): void {
  if (!Array.isArray(grants))
    throw new Error("Warehouse grant list is invalid.");
  const keys = new Set<string>();
  for (const grant of grants as readonly unknown[]) {
    if (
      !isWarehouseGrant(grant, lease, warehouseId) ||
      keys.has(grant.membershipId)
    ) {
      throw new Error(
        "Warehouse grant response escaped the selected scope or contained invalid data.",
      );
    }
    keys.add(grant.membershipId);
  }
}

function validateGrant(
  grant: WarehouseAccessGrantResponse | null,
  lease: PlatformSessionLease,
  warehouseId: string,
  membershipId: string,
  expectedStatus: "ACTIVE" | "REVOKED",
  previousVersion?: number,
): void {
  if (!grant) throw new Error("Warehouse grant response is missing.");
  validateGrants([grant], lease, warehouseId);
  if (
    grant.membershipId !== membershipId ||
    grant.status !== expectedStatus ||
    (previousVersion !== undefined && grant.version <= previousVersion)
  ) {
    throw new Error(
      "Warehouse grant response does not match the requested state transition.",
    );
  }
}

function isWarehouse(value: unknown): value is WarehouseResponse {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value["id"]) &&
    isNonEmptyString(value["code"]) &&
    isNonEmptyString(value["name"]) &&
    isNonEmptyString(value["status"]) &&
    Number.isSafeInteger(value["version"]) &&
    Number(value["version"]) >= 0
  );
}

function isWorkspaceMembership(
  value: unknown,
  lease: PlatformSessionLease,
): value is WorkspaceMembershipResponse {
  if (!isRecord(value)) return false;
  const roles = value["roles"];
  const roleIds = value["roleDefinitionIds"];
  const permissions = value["permissionCodes"];
  return (
    isNonEmptyString(value["id"]) &&
    value["workspaceId"] === lease.scope.workspaceId &&
    ["INTERNAL", "BUYER", "SYSTEM_WORKFLOW"].includes(
      String(value["membershipType"]),
    ) &&
    isNonEmptyString(value["userId"]) &&
    isNonEmptyString(value["email"]) &&
    isNonEmptyString(value["displayName"]) &&
    isNonEmptyString(value["status"]) &&
    Number.isSafeInteger(value["version"]) &&
    Array.isArray(roles) &&
    roles.every(isNonEmptyString) &&
    Array.isArray(roleIds) &&
    roleIds.every(isNonEmptyString) &&
    Array.isArray(permissions) &&
    permissions.every(isNonEmptyString)
  );
}

function isWarehouseGrant(
  value: unknown,
  lease: PlatformSessionLease,
  warehouseId: string,
): value is WarehouseAccessGrantResponse {
  if (!isRecord(value)) return false;
  return (
    value["tenantId"] === lease.scope.tenantId &&
    value["workspaceId"] === lease.scope.workspaceId &&
    value["warehouseId"] === warehouseId &&
    isNonEmptyString(value["membershipId"]) &&
    isNonEmptyString(value["changedByMembershipId"]) &&
    isNonEmptyString(value["changedAt"]) &&
    ["ACTIVE", "REVOKED"].includes(String(value["status"])) &&
    Number.isSafeInteger(value["version"]) &&
    Number(value["version"]) >= 0
  );
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
