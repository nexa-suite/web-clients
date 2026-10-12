import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import {
  NexaApiError,
  NexaCommandRetryStore,
  NexaCreditAccountConfigurationApi,
} from "@nexa/api";
import type {
  CreditAccountConfigurationResponse,
  CreditConfigurationCustomerAccount,
  CreditConfigurationCustomerAccountPage,
} from "@nexa/api";
import { of, Subject, throwError } from "rxjs";
import type {
  PlatformSessionLease,
  PlatformSessionState,
} from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformCreditConfigurationPageComponent } from "./platform-credit-configuration-page.component";

interface PageTestAccess {
  loadCustomerAccounts(): Promise<void>;
  selectAccount(account: CreditConfigurationCustomerAccount): void;
  setCurrency(event: Event): void;
  setCreditLimit(event: Event): void;
  setActive(event: Event): void;
  loadConfiguration(): Promise<void>;
  save(): Promise<void>;
  retrySameCommand(): Promise<void>;
}

interface ApiResponse<T> {
  readonly body: T;
  readonly headers: {
    has(name: string): boolean;
    get(name: string): string | null;
  };
}

function apiResponse<T>(body: T, etag?: string): ApiResponse<T> {
  return {
    body,
    headers: {
      has: (name) => name.toLowerCase() === "etag" && etag !== undefined,
      get: (name) => name.toLowerCase() === "etag" ? etag ?? null : null,
    },
  };
}

describe("PlatformCreditConfigurationPageComponent", () => {
  const lease: PlatformSessionLease = {
    epoch: 1,
    scope: {
      userId: "owner-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-1",
      surface: "PLATFORM",
    },
  };
  const account: CreditConfigurationCustomerAccount = {
    id: "account-1",
    commercialName: "North Market",
    status: "ACTIVE",
  };
  const page: CreditConfigurationCustomerAccountPage = {
    items: [account],
    page: 0,
    size: 25,
    total: 1,
  };

  let api: {
    listCustomerAccounts: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    configure: ReturnType<typeof vi.fn>;
  };
  let retries: {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let sessionState: ReturnType<typeof signal<PlatformSessionState>>;
  let currentLease: PlatformSessionLease | null;
  let fixture: ReturnType<
    typeof TestBed.createComponent<PlatformCreditConfigurationPageComponent>
  >;
  let component: PageTestAccess;

  beforeEach(() => {
    currentLease = lease;
    api = {
      listCustomerAccounts: vi.fn(() => of(page)),
      read: vi.fn(),
      configure: vi.fn(),
    };
    retries = { read: vi.fn(() => null), write: vi.fn(), remove: vi.fn() };
    sessionState = signal<PlatformSessionState>({
      status: "authenticated",
      session: {
        surface: "PLATFORM",
        membership: {
          roles: ["BUSINESS_OPERATIONS_MANAGER"],
          permissions: ["client.credit.configuration.manage"],
        },
      },
    });
    TestBed.configureTestingModule({
      imports: [PlatformCreditConfigurationPageComponent],
      providers: [
        { provide: NexaCreditAccountConfigurationApi, useValue: api },
        { provide: NexaCommandRetryStore, useValue: retries },
        {
          provide: PlatformSessionStore,
          useValue: {
            state: sessionState,
            captureSessionLease: vi.fn(() => currentLease),
            isSessionLeaseCurrent: vi.fn((candidate: PlatformSessionLease) =>
              sameLeaseForTest(candidate, currentLease),
            ),
            expireSessionIfCurrent: vi.fn(() => true),
            invalidateContextIfCurrent: vi.fn(() => true),
          },
        },
        {
          provide: Router,
          useValue: { url: "/credit-configuration", navigate: vi.fn() },
        },
      ],
    });
    fixture = TestBed.createComponent(PlatformCreditConfigurationPageComponent);
    component = fixture.componentInstance as unknown as PageTestAccess;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("does not load candidates when only the broader financial-adjustment permission is present", async () => {
    sessionState.set({
      status: "authenticated",
      session: {
        surface: "PLATFORM",
        membership: {
          roles: ["BUSINESS_OPERATIONS_MANAGER"],
          permissions: ["client.credit.manage"],
        },
      },
    });
    fixture.detectChanges();
    await component.loadCustomerAccounts();
    fixture.detectChanges();

    expect(api.listCustomerAccounts).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      "dedicated credit-configuration capability",
    );
  });

  it("creates a first configuration with explicit currency, If-None-Match and an opaque retry key", async () => {
    vi.stubGlobal("crypto", {
      subtle: { digest: vi.fn(async () => new Uint8Array(32).fill(12).buffer) },
      randomUUID: vi.fn(() => "123e4567-e89b-42d3-a456-426614174000"),
    });
    const unconfigured: CreditAccountConfigurationResponse = {
      clientAccountId: "account-1",
      currency: "PEN",
      status: "NOT_CONFIGURED",
      creditLimit: null,
      financedExposure: null,
      outstandingReceivables: null,
      reservedExposure: null,
      used: null,
      availableCredit: null,
      version: null,
    };
    const configured: CreditAccountConfigurationResponse = {
      clientAccountId: "account-1",
      currency: "PEN",
      status: "ACTIVE",
      creditLimit: 500,
      financedExposure: 0,
      outstandingReceivables: 0,
      reservedExposure: 0,
      used: 0,
      availableCredit: 500,
      version: 0,
    };
    api.read.mockReturnValue(of(apiResponse(unconfigured)));
    api.configure.mockReturnValue(
      of(apiResponse(configured, '"0"')),
    );

    fixture.detectChanges();
    await component.loadCustomerAccounts();
    component.selectAccount(account);
    component.setCurrency(eventWithValue("PEN"));
    await component.loadConfiguration();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "No credit account is configured for PEN",
    );
    expect(fixture.nativeElement.textContent).not.toContain("PEN 0.00");

    component.setCreditLimit(eventWithValue("500.00"));
    component.setActive(eventWithChecked(true));
    await component.save();
    fixture.detectChanges();

    expect(api.configure).toHaveBeenCalledOnce();
    expect(api.configure).toHaveBeenCalledWith(
      "account-1",
      { currency: "PEN", creditLimit: 500, active: true },
      { ifNoneMatch: "*" },
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(retries.write).toHaveBeenCalledWith(
      expect.stringMatching(
        /^nexa:platform:credit-configuration:owner-1:tenant-1:workspace-1:membership-1:account-1:PEN:[a-f0-9]{64}$/,
      ),
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "Credit configuration saved.",
    );
  });

  it("retries an uncertain write with the same idempotency key and exact command intent", async () => {
    vi.stubGlobal("crypto", {
      subtle: { digest: vi.fn(async () => new Uint8Array(32).fill(6).buffer) },
      randomUUID: vi.fn(() => "123e4567-e89b-42d3-a456-426614174001"),
    });
    const unconfigured: CreditAccountConfigurationResponse = {
      clientAccountId: "account-1",
      currency: "PEN",
      status: "NOT_CONFIGURED",
      creditLimit: null,
      financedExposure: null,
      outstandingReceivables: null,
      reservedExposure: null,
      used: null,
      availableCredit: null,
      version: null,
    };
    const configured: CreditAccountConfigurationResponse = {
      clientAccountId: "account-1",
      currency: "PEN",
      status: "ACTIVE",
      creditLimit: 700,
      financedExposure: 0,
      outstandingReceivables: 0,
      reservedExposure: 0,
      used: 0,
      availableCredit: 700,
      version: 0,
    };
    api.read.mockReturnValue(of(apiResponse(unconfigured)));
    api.configure
      .mockReturnValueOnce(
        throwError(() => new NexaApiError("timeout", null, null)),
      )
      .mockReturnValueOnce(
        of(apiResponse(configured, '"0"')),
      );

    fixture.detectChanges();
    await component.loadCustomerAccounts();
    component.selectAccount(account);
    component.setCurrency(eventWithValue("PEN"));
    await component.loadConfiguration();
    component.setCreditLimit(eventWithValue("700"));
    component.setActive(eventWithChecked(true));
    await component.save();
    await component.retrySameCommand();

    expect(api.configure).toHaveBeenCalledTimes(2);
    expect(api.configure.mock.calls[0]).toEqual(api.configure.mock.calls[1]);
    expect(retries.remove).toHaveBeenCalledOnce();
  });

  it("ignores a configuration read for account A after the selection moves to account B", async () => {
    const secondAccount: CreditConfigurationCustomerAccount = {
      id: "account-2",
      commercialName: "South Market",
      status: "ACTIVE",
    };
    const pendingRead = new Subject<ApiResponse<CreditAccountConfigurationResponse>>();
    api.read.mockReturnValueOnce(pendingRead.asObservable());

    fixture.detectChanges();
    await component.loadCustomerAccounts();
    component.selectAccount(account);
    component.setCurrency(eventWithValue("PEN"));
    const readPromise = component.loadConfiguration();

    component.selectAccount(secondAccount);
    pendingRead.next(
      apiResponse({
          clientAccountId: account.id,
          currency: "PEN",
          status: "ACTIVE",
          creditLimit: 100,
          financedExposure: 20,
          outstandingReceivables: 30,
          reservedExposure: 10,
          used: 60,
          availableCredit: 40,
          version: 7,
        }, '"7"'),
    );
    pendingRead.complete();
    await readPromise;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("South Market");
    expect(fixture.nativeElement.textContent).not.toContain("PEN 60.00");
    expect(fixture.nativeElement.textContent).toContain(
      "Enter a currency and load the server snapshot.",
    );
  });

  it("does not apply an account A command response after the selected account changes", async () => {
    vi.stubGlobal("crypto", {
      subtle: { digest: vi.fn(async () => new Uint8Array(32).fill(8).buffer) },
      randomUUID: vi.fn(() => "123e4567-e89b-42d3-a456-426614174002"),
    });
    const configured: CreditAccountConfigurationResponse = {
      clientAccountId: account.id,
      currency: "PEN",
      status: "ACTIVE",
      creditLimit: 100,
      financedExposure: 20,
      outstandingReceivables: 30,
      reservedExposure: 10,
      used: 60,
      availableCredit: 40,
      version: 7,
    };
    const commandResponse = new Subject<ApiResponse<CreditAccountConfigurationResponse>>();
    api.read.mockReturnValue(
      of(apiResponse(configured, '"7"')),
    );
    api.configure.mockReturnValue(commandResponse.asObservable());

    fixture.detectChanges();
    await component.loadCustomerAccounts();
    component.selectAccount(account);
    component.setCurrency(eventWithValue("PEN"));
    await component.loadConfiguration();
    component.setCreditLimit(eventWithValue("200"));
    component.setActive(eventWithChecked(true));
    const commandPromise = component.save();
    await vi.waitFor(() => expect(api.configure).toHaveBeenCalledOnce());

    const internals = fixture.componentInstance as unknown as {
      selectedAccount: { set(value: CreditConfigurationCustomerAccount): void };
      configuration: { set(value: { readonly status: "idle" }): void };
    };
    internals.selectedAccount.set({
      id: "account-2",
      commercialName: "South Market",
      status: "ACTIVE",
    });
    internals.configuration.set({ status: "idle" });
    commandResponse.next(
      apiResponse(
        { ...configured, creditLimit: 200, availableCredit: 140, version: 8 },
        '"8"',
      ),
    );
    commandResponse.complete();
    await commandPromise;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("South Market");
    expect(fixture.nativeElement.textContent).not.toContain("PEN 140.00");
    expect(fixture.nativeElement.textContent).toContain(
      "Enter a currency and load the server snapshot.",
    );
  });

  it("clears the selected account snapshot and ETag after the Tenant lease and authorization version change", async () => {
    const configured: CreditAccountConfigurationResponse = {
      clientAccountId: account.id,
      currency: "PEN",
      status: "ACTIVE",
      creditLimit: 100,
      financedExposure: 20,
      outstandingReceivables: 30,
      reservedExposure: 10,
      used: 60,
      availableCredit: 40,
      version: 7,
    };
    api.read.mockReturnValue(of(apiResponse(configured, '"7"')));

    fixture.detectChanges();
    await component.loadCustomerAccounts();
    component.selectAccount(account);
    component.setCurrency(eventWithValue("PEN"));
    await component.loadConfiguration();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("PEN 60.00");

    currentLease = {
      epoch: 2,
      scope: { ...lease.scope, tenantId: "tenant-2", workspaceId: "workspace-2" },
    };
    const previous = sessionState();
    if (previous.status !== "authenticated") throw new Error("Session fixture is not authenticated.");
    sessionState.set({
      status: "authenticated",
      session: {
        ...previous.session,
        membership: {
          ...previous.session.membership,
          authorizationVersion: 2,
        },
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("PEN 60.00");
    expect(fixture.nativeElement.textContent).toContain(
      "Select an account to inspect its credit configuration.",
    );
    await component.save();
    expect(api.configure).not.toHaveBeenCalled();
  });
});

function eventWithValue(value: string): Event {
  return { target: { value } } as unknown as Event;
}

function eventWithChecked(checked: boolean): Event {
  return { target: { checked } } as unknown as Event;
}

function sameLeaseForTest(
  left: PlatformSessionLease | null,
  right: PlatformSessionLease | null,
): boolean {
  return left?.epoch === right?.epoch &&
    left?.scope.userId === right?.scope.userId &&
    left?.scope.tenantId === right?.scope.tenantId &&
    left?.scope.workspaceId === right?.scope.workspaceId &&
    left?.scope.membershipId === right?.scope.membershipId &&
    left?.scope.surface === right?.scope.surface;
}
