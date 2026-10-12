import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  signal,
} from "@angular/core";
import { NexaButton, NexaSurface } from "nexa-ui";
import type { RoleDefinitionResponse } from "@nexa/api";
import { PlatformTenantAccessGovernanceStore } from "../../application/platform-tenant-access-governance.store";

interface RoleDraft {
  readonly roleId: string | null;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

type RoleDraftField = "code" | "name" | "description";

@Component({
  selector: "platform-tenant-roles-page",
  standalone: true,
  imports: [NexaButton, NexaSurface],
  templateUrl: "./platform-tenant-roles-page.component.html",
  styleUrl: "./tenant-access-governance-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformTenantRolesPageComponent implements OnInit {
  protected readonly store = inject(PlatformTenantAccessGovernanceStore);
  protected readonly state = this.store.state;
  protected readonly draft = signal<RoleDraft | null>(null);
  private observedScope = "";

  constructor() {
    effect(() => {
      const lease = this.state().lease;
      const scope = lease
        ? `${lease.epoch}:${lease.scope.tenantId}:${lease.scope.workspaceId}:${lease.scope.membershipId}`
        : "no-active-lease";
      if (scope === this.observedScope) return;
      this.observedScope = scope;
      this.draft.set(null);
    });
  }

  ngOnInit(): void {
    void this.store.load();
  }

  protected refresh(): void {
    void this.store.load();
  }

  protected startCreate(): void {
    this.draft.set({
      roleId: null,
      code: "",
      name: "",
      description: "",
      permissions: [],
    });
  }

  protected startEdit(role: RoleDefinitionResponse): void {
    if (role.type !== "CUSTOM" || role.status !== "ACTIVE") return;
    this.draft.set({
      roleId: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    });
  }

  protected setField(field: RoleDraftField, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    this.draft.update((draft) =>
      draft ? { ...draft, [field]: target.value } : draft,
    );
  }

  protected togglePermission(permission: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.draft.update((draft) => {
      if (!draft) return draft;
      const permissions = new Set(draft.permissions);
      if (target.checked) permissions.add(permission);
      else permissions.delete(permission);
      return { ...draft, permissions: [...permissions] };
    });
  }

  protected permissionSelected(permission: string): boolean {
    return this.draft()?.permissions.includes(permission) ?? false;
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    const existing = draft.roleId
      ? this.state().roles.find((role) => role.id === draft.roleId)
      : null;
    if (draft.roleId && !existing) return;
    const succeeded = existing
      ? await this.store.updateRoleDefinition(existing, {
          name: draft.name,
          description: draft.description,
          permissions: draft.permissions,
        })
      : await this.store.createRoleDefinition({
          code: draft.code,
          name: draft.name,
          description: draft.description,
          permissions: draft.permissions,
        });
    if (succeeded) this.draft.set(null);
  }

  protected async deactivate(role: RoleDefinitionResponse): Promise<void> {
    await this.store.deactivateRoleDefinition(role);
  }

  protected cancelEdit(): void {
    this.draft.set(null);
  }

  protected scopeLabel(role: RoleDefinitionResponse): string {
    if (role.type.startsWith("SYSTEM_")) return "Built-in role";
    return role.workspaceId
      ? "Active Workspace"
      : "Tenant-wide API role · read-only";
  }
}
