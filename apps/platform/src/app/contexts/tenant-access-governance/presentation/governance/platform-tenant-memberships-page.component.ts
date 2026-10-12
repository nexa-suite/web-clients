import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { NexaButton, NexaSurface } from "nexa-ui";
import type {
  InvitationResponse,
  InternalMembershipRole,
  WorkspaceMembershipResponse,
} from "@nexa/api";
import {
  PLATFORM_INTERNAL_MEMBERSHIP_ROLES,
  PlatformTenantAccessGovernanceStore,
} from "../../application/platform-tenant-access-governance.store";

@Component({
  selector: "platform-tenant-memberships-page",
  standalone: true,
  imports: [DatePipe, NexaButton, NexaSurface],
  templateUrl: "./platform-tenant-memberships-page.component.html",
  styleUrl: "./tenant-access-governance-pages.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformTenantMembershipsPageComponent implements OnInit {
  protected readonly store = inject(PlatformTenantAccessGovernanceStore);
  protected readonly state = this.store.state;
  protected readonly roles = PLATFORM_INTERNAL_MEMBERSHIP_ROLES;
  protected readonly invitationEmail = signal("");
  protected readonly invitationName = signal("");
  protected readonly invitationRoles = signal<readonly InternalMembershipRole[]>([
    "SALES",
  ]);
  protected readonly roleDrafts = signal<Readonly<Record<string, readonly string[]>>>({});
  private observedScope = "";

  constructor() {
    effect(() => {
      const lease = this.state().lease;
      const scope = lease
        ? `${lease.epoch}:${lease.scope.tenantId}:${lease.scope.workspaceId}:${lease.scope.membershipId}`
        : "no-active-lease";
      if (scope === this.observedScope) return;
      this.observedScope = scope;
      this.invitationEmail.set("");
      this.invitationName.set("");
      this.invitationRoles.set(["SALES"]);
      this.roleDrafts.set({});
    });
  }

  ngOnInit(): void {
    void this.store.load();
  }

  protected refresh(): void {
    void this.store.load();
  }

  protected setInvitationEmail(event: Event): void {
    this.invitationEmail.set(inputValue(event));
  }

  protected setInvitationName(event: Event): void {
    this.invitationName.set(inputValue(event));
  }

  protected toggleInvitationRole(role: InternalMembershipRole, event: Event): void {
    const selected = checkboxValue(event);
    this.invitationRoles.update((roles) => {
      const next = new Set(roles);
      if (selected) next.add(role);
      else next.delete(role);
      return [...next];
    });
  }

  protected async invite(): Promise<void> {
    const succeeded = await this.store.inviteMember({
      email: this.invitationEmail(),
      displayName: this.invitationName(),
      roles: this.invitationRoles(),
    });
    if (succeeded) {
      this.invitationEmail.set("");
      this.invitationName.set("");
      this.invitationRoles.set(["SALES"]);
    }
  }

  protected roleIdsFor(membership: WorkspaceMembershipResponse): readonly string[] {
    return (
      this.roleDrafts()[membership.id] ??
      membership.roleDefinitionIds.filter((id) =>
        this.assignableRoles().some((role) => role.id === id),
      )
    );
  }

  protected assignableRoles() {
    return this.store.assignableRoleDefinitions();
  }

  protected roleName(id: string): string {
    return this.state().roles.find((role) => role.id === id)?.name ?? id;
  }

  protected canEditRoles(membership: WorkspaceMembershipResponse): boolean {
    return this.store.canAssignRoles() && this.isActive(membership.status);
  }

  protected updateRoleDraft(membershipId: string, event: Event): void {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const selected = Array.from(select.selectedOptions, (option) => option.value);
    this.roleDrafts.update((drafts) => ({ ...drafts, [membershipId]: selected }));
  }

  protected hasRoleChanges(membership: WorkspaceMembershipResponse): boolean {
    const before = membership.roleDefinitionIds
      .filter((id) => this.assignableRoles().some((role) => role.id === id))
      .slice()
      .sort();
    const after = [...this.roleIdsFor(membership)].sort();
    return JSON.stringify(before) !== JSON.stringify(after);
  }

  protected async saveRoles(membership: WorkspaceMembershipResponse): Promise<void> {
    const succeeded = await this.store.assignMembershipRoles(
      membership.id,
      membership.version,
      this.roleIdsFor(membership),
    );
    if (succeeded) {
      this.roleDrafts.update((drafts) => {
        const next = { ...drafts };
        delete next[membership.id];
        return next;
      });
    }
  }

  protected async changeMembershipStatus(
    action: "suspend" | "reactivate" | "revoke",
    membership: WorkspaceMembershipResponse,
  ): Promise<void> {
    await this.store.changeMembershipStatus(action, membership);
  }

  protected async changeInvitationStatus(
    action: "resend" | "revoke",
    invitation: InvitationResponse,
  ): Promise<void> {
    await this.store.changeInvitationStatus(action, invitation);
  }

  protected changeInvitationPage(offset: number): void {
    const current = this.state().invitations?.page ?? 0;
    void this.store.load(Math.max(0, current + offset));
  }

  protected isActive(status: string): boolean {
    return status.toUpperCase() === "ACTIVE";
  }

  protected isSuspended(status: string): boolean {
    return status.toUpperCase() === "SUSPENDED";
  }
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

function checkboxValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}
