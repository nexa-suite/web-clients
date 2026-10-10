import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { Router } from "@angular/router";
import {
  NexaApiError,
  NexaCommandRetryStore,
  NexaCreditAccountConfigurationApi,
} from "@nexa/api";
import type {
  ConfigureCreditAccountRequest,
  CreditAccountConfigurationResponse,
  CreditConfigurationCustomerAccount,
  CreditConfigurationCustomerAccountPage,
} from "@nexa/api";
import { firstValueFrom } from "rxjs";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
} from "../../tenant-access-governance/application/public-api";
import { creditConfigurationRetryIdentity } from "../application/credit-configuration-command-retry";

type DirectoryState =
  | { readonly status: "idle" | "loading" }
  | {
      readonly status: "ready";
      readonly page: CreditConfigurationCustomerAccountPage;
    }
  | {
      readonly status: "error";
      readonly message: string;
      readonly retryable: boolean;
    };

type ConfigurationState =
  | { readonly status: "idle" | "loading" }
  | {
      readonly status: "not-configured";
      readonly value: Extract<
        CreditAccountConfigurationResponse,
        { status: "NOT_CONFIGURED" }
      >;
    }
  | {
      readonly status: "ready";
      readonly value: Exclude<
        CreditAccountConfigurationResponse,
        { status: "NOT_CONFIGURED" }
      >;
      readonly etag: string;
    }
  | {
      readonly status: "error";
      readonly message: string;
      readonly retryable: boolean;
    };

interface PendingCommand {
  readonly accountId: string;
  readonly lease: PlatformSessionLease;
  readonly configurationRevision: number;
  readonly request: ConfigureCreditAccountRequest;
  readonly precondition:
    | { readonly ifNoneMatch: "*" }
    | { readonly ifMatch: string };
  readonly idempotencyKey: string;
  readonly storageKey: string;
}

const PAGE_SIZE = 25;
const CREDIT_CONFIGURATION_PERMISSION = "client.credit.configuration.manage";
const ALLOWED_ROLES = new Set(["BUSINESS_OPERATIONS_MANAGER", "COMPANY_OWNER"]);

@Component({
  selector: "platform-credit-configuration-page",
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: "./platform-credit-configuration-page.component.html",
  styleUrl: "./platform-credit-configuration-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformCreditConfigurationPageComponent implements OnInit {
  private readonly api = inject(NexaCreditAccountConfigurationApi);
  private readonly retries = inject(NexaCommandRetryStore);
  private readonly sessions = inject(PlatformSessionStore);
  private readonly router = inject(Router);
  private readonly contextLease = signal<PlatformSessionLease | null>(
    this.sessions.captureSessionLease(),
  );
  private readonly contextAuthorizationFingerprint = signal(
    this.authorizationFingerprint(),
  );
  private initialized = false;
  private lastCanConfigure = false;
  private directoryRevision = 0;
  private configurationRevision = 0;
  private commandRevision = 0;
  private readonly pending = signal<PendingCommand | null>(null);

  protected readonly directory = signal<DirectoryState>({ status: "idle" });
  protected readonly configuration = signal<ConfigurationState>({
    status: "idle",
  });
  protected readonly selectedAccount =
    signal<CreditConfigurationCustomerAccount | null>(null);
  protected readonly search = signal("");
  protected readonly accountStatus = signal("ACTIVE");
  protected readonly currency = signal("");
  protected readonly creditLimit = signal("");
  protected readonly active = signal(false);
  protected readonly commandMessage = signal("");
  protected readonly saving = signal(false);
  protected readonly pageIndex = signal(0);

  protected readonly contextIsCurrent = computed(() => {
    const lease = this.sessions.captureSessionLease();
    return (
      sameLease(this.contextLease(), lease) &&
      this.contextAuthorizationFingerprint() === this.authorizationFingerprint()
    );
  });

  protected readonly canConfigure = computed(() => {
    const current = this.sessions.state();
    if (current.status !== "authenticated" || !this.contextIsCurrent())
      return false;
    const session = current.session;
    const roles = new Set(session.membership?.roles ?? []);
    const permissions = new Set(session.membership?.permissions ?? []);
    return (
      session.surface === "PLATFORM" &&
      [...ALLOWED_ROLES].some((role) => roles.has(role)) &&
      permissions.has(CREDIT_CONFIGURATION_PERMISSION)
    );
  });

  constructor() {
    effect(() => {
      const lease = this.sessions.captureSessionLease();
      const authorized = this.canConfigure();
      const authorizationFingerprint = this.authorizationFingerprint();
      const priorLease = untracked(() => this.contextLease());
      const priorAuthorizationFingerprint = untracked(() =>
        this.contextAuthorizationFingerprint(),
      );
      const leaseChanged = !sameLease(priorLease, lease);
      const authorizationChanged =
        authorizationFingerprint !== priorAuthorizationFingerprint;
      const previouslyAuthorized = this.lastCanConfigure;
      const permissionGranted = authorized && !this.lastCanConfigure;
      this.lastCanConfigure = authorized;

      if (leaseChanged || authorizationChanged) {
        this.clearContextState();
        this.contextLease.set(lease);
        this.contextAuthorizationFingerprint.set(authorizationFingerprint);
      } else if (!authorized && previouslyAuthorized) {
        this.clearContextState();
      }

      if (
        lease &&
        authorized &&
        this.initialized &&
        (leaseChanged || authorizationChanged || permissionGranted)
      ) {
        void this.loadCustomerAccounts();
      }
    });
  }

  protected readonly hasAmbiguousCommand = computed(
    () => this.pending() !== null,
  );
  protected readonly canSave = computed(() => {
    const state = this.configuration();
    const account = this.selectedAccount();
    return (
      this.canConfigure() &&
      account !== null &&
      (state.status === "ready" || state.status === "not-configured") &&
      !(state.status === "ready" && state.value.status === "CLOSED") &&
      !this.saving() &&
      this.pending() === null &&
      /^[0-9]{1,15}(?:\.[0-9]{1,4})?$/.test(this.creditLimit().trim()) &&
      /^[A-Za-z]{3}$/.test(this.currency().trim())
    );
  });

  ngOnInit(): void {
    void this.loadCustomerAccounts();
  }

  protected setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected setAccountStatus(event: Event): void {
    this.accountStatus.set((event.target as HTMLSelectElement).value);
    this.pageIndex.set(0);
    void this.loadCustomerAccounts();
  }

  protected setCurrency(event: Event): void {
    if (
      this.pending() ||
      this.configuration().status === "ready" ||
      !this.canConfigure()
    ) {
      return;
    }
    const next = (event.target as HTMLInputElement).value.toUpperCase();
    if (next === this.currency()) return;
    this.configurationRevision += 1;
    this.configuration.set({ status: "idle" });
    this.creditLimit.set("");
    this.active.set(false);
    this.commandMessage.set("");
    this.currency.set(next);
  }

  protected setCreditLimit(event: Event): void {
    if (this.pending()) return;
    this.creditLimit.set((event.target as HTMLInputElement).value);
  }

  protected setActive(event: Event): void {
    if (this.pending()) return;
    this.active.set((event.target as HTMLInputElement).checked);
  }

  protected async loadCustomerAccounts(): Promise<void> {
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.directoryRevision;
    if (!this.canConfigure() || !lease) {
      this.directory.set({
        status: "error",
        message:
          "A current Platform membership with the credit-configuration role and capability is required.",
        retryable: false,
      });
      return;
    }
    this.directory.set({ status: "loading" });
    try {
      const page = await firstValueFrom(
        this.api.listCustomerAccounts(
          this.search().trim(),
          this.accountStatus(),
          this.pageIndex(),
          PAGE_SIZE,
        ),
      );
      if (!this.isCurrent(revision, lease, "directory")) return;
      this.directory.set({ status: "ready", page });
    } catch (error: unknown) {
      if (!this.isCurrent(revision, lease, "directory")) return;
      if (this.handleSessionError(error, lease)) return;
      this.directory.set({
        status: "error",
        message: directoryErrorMessage(error),
        retryable: true,
      });
    }
  }

  protected async changePage(offset: number): Promise<void> {
    const current = this.directory();
    if (current.status !== "ready") return;
    const totalPages = Math.max(
      1,
      Math.ceil(current.page.total / Math.max(current.page.size, 1)),
    );
    const next = this.pageIndex() + offset;
    if (next < 0 || next >= totalPages) return;
    this.pageIndex.set(next);
    await this.loadCustomerAccounts();
  }

  protected async searchAccounts(): Promise<void> {
    this.pageIndex.set(0);
    await this.loadCustomerAccounts();
  }

  protected selectAccount(account: CreditConfigurationCustomerAccount): void {
    if (this.pending() || this.saving() || !this.canConfigure()) return;
    this.configurationRevision += 1;
    this.selectedAccount.set(account);
    this.configuration.set({ status: "idle" });
    this.creditLimit.set("");
    this.active.set(false);
    this.commandMessage.set("");
  }

  protected async loadConfiguration(): Promise<void> {
    const account = this.selectedAccount();
    const currency = this.normalizedCurrency();
    const lease = this.sessions.captureSessionLease();
    const revision = ++this.configurationRevision;
    if (!account || !currency || !this.canConfigure() || !lease) {
      this.configuration.set({
        status: "error",
        message:
          "Select an account and enter a three-letter currency before loading credit configuration.",
        retryable: false,
      });
      return;
    }
    this.configuration.set({ status: "loading" });
    this.commandMessage.set("");
    try {
      const response = await firstValueFrom(
        this.api.read(account.id, currency),
      );
      if (
        !this.isConfigurationRequestCurrent(
          revision,
          lease,
          account.id,
          currency,
        )
      ) {
        return;
      }
      const value = response.body;
      if (
        !value ||
        value.clientAccountId !== account.id ||
        value.currency !== currency
      ) {
        throw new Error(
          "The API returned a credit configuration for a different account or currency.",
        );
      }
      if (value.status === "NOT_CONFIGURED") {
        if (response.headers.has("ETag"))
          throw new Error(
            "The API returned a version for an unconfigured account.",
          );
        this.creditLimit.set("");
        this.active.set(false);
        this.configuration.set({ status: "not-configured", value });
      } else {
        const etag = response.headers.get("ETag");
        if (!etag || etag !== `"${value.version}"`)
          throw new Error(
            "The API did not return a matching credit configuration version.",
          );
        this.currency.set(value.currency);
        this.creditLimit.set(String(value.creditLimit));
        this.active.set(value.status === "ACTIVE");
        this.configuration.set({ status: "ready", value, etag });
      }
    } catch (error: unknown) {
      if (
        !this.isConfigurationRequestCurrent(
          revision,
          lease,
          account.id,
          currency,
        )
      ) {
        return;
      }
      if (this.handleSessionError(error, lease)) return;
      this.configuration.set({
        status: "error",
        message: configurationErrorMessage(error),
        retryable: true,
      });
    }
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    const account = this.selectedAccount();
    const state = this.configuration();
    const lease = this.sessions.captureSessionLease();
    const configurationRevision = this.configurationRevision;
    if (
      !account ||
      !lease ||
      (state.status !== "ready" && state.status !== "not-configured")
    )
      return;

    const request: ConfigureCreditAccountRequest = {
      currency: this.normalizedCurrency()!,
      creditLimit: Number(this.creditLimit().trim()),
      active: this.active(),
    };
    const precondition =
      state.status === "not-configured"
        ? { ifNoneMatch: "*" as const }
        : { ifMatch: state.etag };
    let identity;
    try {
      identity = await creditConfigurationRetryIdentity(
        this.retries,
        this.sessions,
        lease,
        account.id,
        request,
        precondition,
      );
    } catch {
      identity = null;
    }
    if (
      configurationRevision !== this.configurationRevision ||
      this.selectedAccount()?.id !== account.id ||
      this.normalizedCurrency() !== request.currency
    ) {
      return;
    }
    if (
      !identity ||
      !this.sessions.isSessionLeaseCurrent(lease) ||
      !this.canConfigure() ||
      !sameLease(this.contextLease(), lease)
    ) {
      this.commandMessage.set(
        "This browser could not preserve a scoped retry key. The configuration was not sent.",
      );
      return;
    }
    await this.send({
      accountId: account.id,
      lease,
      configurationRevision,
      request,
      precondition,
      idempotencyKey: identity.key,
      storageKey: identity.storageKey,
    });
  }

  protected async retrySameCommand(): Promise<void> {
    const pending = this.pending();
    if (
      !pending ||
      this.saving() ||
      pending.configurationRevision !== this.configurationRevision ||
      this.selectedAccount()?.id !== pending.accountId ||
      this.normalizedCurrency() !== pending.request.currency ||
      !this.sessions.isSessionLeaseCurrent(pending.lease) ||
      !this.canConfigure() ||
      !sameLease(this.contextLease(), pending.lease)
    )
      return;
    await this.send(pending);
  }

  protected formatAmount(amount: number, currency: string): string {
    return `${currency} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount)}`;
  }

  private clearContextState(): void {
    this.directoryRevision += 1;
    this.configurationRevision += 1;
    this.commandRevision += 1;
    this.directory.set({ status: "idle" });
    this.configuration.set({ status: "idle" });
    this.selectedAccount.set(null);
    this.currency.set("");
    this.creditLimit.set("");
    this.active.set(false);
    this.commandMessage.set("");
    this.pending.set(null);
    this.saving.set(false);
    this.search.set("");
    this.accountStatus.set("ACTIVE");
    this.pageIndex.set(0);
  }

  private authorizationFingerprint(): string {
    const current = this.sessions.state();
    if (current.status !== "authenticated") return "unauthenticated";
    const membership = current.session.membership;
    return JSON.stringify({
      authorizationVersion: membership?.authorizationVersion ?? null,
      roles: [...(membership?.roles ?? [])].sort(),
      permissions: [...(membership?.permissions ?? [])].sort(),
      roleDefinitionIds: [...(membership?.roleDefinitionIds ?? [])].sort(),
    });
  }

  protected totalPages(page: CreditConfigurationCustomerAccountPage): number {
    return Math.max(1, Math.ceil(page.total / Math.max(page.size, 1)));
  }

  private async send(command: PendingCommand): Promise<void> {
    if (
      this.saving() ||
      command.configurationRevision !== this.configurationRevision ||
      this.selectedAccount()?.id !== command.accountId ||
      this.normalizedCurrency() !== command.request.currency ||
      !this.sessions.isSessionLeaseCurrent(command.lease) ||
      !this.canConfigure() ||
      !sameLease(this.contextLease(), command.lease)
    )
      return;
    const commandRevision = ++this.commandRevision;
    this.saving.set(true);
    this.commandMessage.set("");
    try {
      const response = await firstValueFrom(
        this.api.configure(
          command.accountId,
          command.request,
          command.precondition,
          command.idempotencyKey,
        ),
      );
      if (!this.isCommandCurrent(command)) return;
      const value = response.body;
      const etag = response.headers.get("ETag");
      if (
        !value ||
        value.clientAccountId !== command.accountId ||
        value.currency !== command.request.currency ||
        !etag ||
        etag !== `"${value.version}"`
      ) {
        throw new Error(
          "The API returned an incomplete credit configuration response.",
        );
      }
      this.retries.remove(command.storageKey);
      this.pending.set(null);
      this.configuration.set({
        status: "ready",
        value: value as Exclude<
          CreditAccountConfigurationResponse,
          { status: "NOT_CONFIGURED" }
        >,
        etag,
      });
      this.creditLimit.set(String(value.creditLimit));
      this.currency.set(value.currency);
      this.active.set(value.status === "ACTIVE");
      this.commandMessage.set("Credit configuration saved.");
    } catch (error: unknown) {
      if (!this.isCommandCurrent(command)) return;
      if (this.handleSessionError(error, command.lease)) return;
      const mapped = error instanceof NexaApiError ? error : null;
      if (
        mapped &&
        ["network", "timeout", "server", "unknown"].includes(mapped.kind)
      ) {
        this.pending.set(command);
        this.commandMessage.set(
          "The result is uncertain. Retry this same command to safely check its outcome.",
        );
      } else {
        this.retries.remove(command.storageKey);
        this.pending.set(null);
        const message = commandErrorMessage(error);
        this.commandMessage.set(message);
        if (mapped?.kind === "precondition" || mapped?.kind === "conflict") {
          await this.loadConfiguration();
          this.commandMessage.set(message);
        }
      }
    } finally {
      if (commandRevision === this.commandRevision) this.saving.set(false);
    }
  }

  private isCommandCurrent(command: PendingCommand): boolean {
    return (
      command.configurationRevision === this.configurationRevision &&
      this.selectedAccount()?.id === command.accountId &&
      this.normalizedCurrency() === command.request.currency &&
      this.sessions.isSessionLeaseCurrent(command.lease) &&
      sameLease(this.contextLease(), command.lease) &&
      this.contextIsCurrent() &&
      this.canConfigure()
    );
  }

  private isConfigurationRequestCurrent(
    revision: number,
    lease: PlatformSessionLease,
    accountId: string,
    currency: string,
  ): boolean {
    return (
      this.isCurrent(revision, lease, "configuration") &&
      this.selectedAccount()?.id === accountId &&
      this.normalizedCurrency() === currency &&
      this.contextIsCurrent()
    );
  }

  private normalizedCurrency(): string | null {
    const value = this.currency().trim().toUpperCase();
    return /^[A-Z]{3}$/.test(value) ? value : null;
  }

  private isCurrent(
    revision: number,
    lease: PlatformSessionLease,
    request: "directory" | "configuration",
  ): boolean {
    return (
      (request === "directory"
        ? revision === this.directoryRevision
        : revision === this.configurationRevision) &&
      this.sessions.isSessionLeaseCurrent(lease)
    );
  }

  private handleSessionError(
    error: unknown,
    lease: PlatformSessionLease,
  ): boolean {
    if (!(error instanceof NexaApiError)) return false;
    if (error.kind === "unauthenticated") {
      if (this.sessions.expireSessionIfCurrent(lease)) {
        void this.router.navigate(["/sign-in"], {
          queryParams: { returnUrl: this.router.url },
        });
      }
      return true;
    }
    if (error.problem?.code === "ACCESS_CONTEXT_INVALID") {
      if (this.sessions.invalidateContextIfCurrent(lease)) {
        void this.router.navigate(["/sign-in"], {
          queryParams: { returnUrl: this.router.url },
        });
      }
      return true;
    }
    return false;
  }
}

function sameLease(
  left: PlatformSessionLease | null,
  right: PlatformSessionLease | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.epoch === right.epoch &&
    left.scope.userId === right.scope.userId &&
    left.scope.tenantId === right.scope.tenantId &&
    left.scope.workspaceId === right.scope.workspaceId &&
    left.scope.membershipId === right.scope.membershipId &&
    left.scope.surface === right.scope.surface
  );
}

function directoryErrorMessage(error: unknown): string {
  if (error instanceof NexaApiError && error.kind === "forbidden")
    return "The active Platform membership cannot view accounts for credit configuration.";
  if (error instanceof NexaApiError && error.kind === "server")
    return "Credit configuration is unavailable in this Tenant. Try again later.";
  return "Customer accounts could not be loaded. Try again.";
}

function configurationErrorMessage(error: unknown): string {
  if (error instanceof NexaApiError && error.kind === "forbidden")
    return "The API denied credit configuration for this active membership.";
  if (error instanceof NexaApiError && error.kind === "not-found")
    return "This account is not available in the active Tenant and Workspace.";
  if (error instanceof NexaApiError && error.kind === "server")
    return "Credit configuration is unavailable in this Tenant. Try again later.";
  return "Credit configuration could not be loaded. Check the currency and try again.";
}

function commandErrorMessage(error: unknown): string {
  if (error instanceof NexaApiError && error.kind === "precondition")
    return "The configuration changed in another session. The current server version has been reloaded.";
  if (error instanceof NexaApiError && error.kind === "conflict")
    return "The server rejected this change because of the account state, credit floor, or idempotency state. Review the refreshed configuration.";
  if (error instanceof NexaApiError && error.kind === "forbidden")
    return "The API denied this change for the active membership.";
  if (error instanceof NexaApiError && error.kind === "validation")
    return "The API rejected the credit limit or currency. Review both values.";
  return "Credit configuration was not saved. Reload the server state before trying again.";
}
