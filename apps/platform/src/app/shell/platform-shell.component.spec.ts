import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { SessionResponse } from "@nexa/api";
import { PlatformShellComponent } from "./platform-shell.component";

describe("PlatformShellComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformShellComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it("renders neutral shell chrome and an authenticated route outlet without session claims", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Nexa Platform");
    expect(fixture.nativeElement.querySelector("nexa-logo")).not.toBeNull();
    expect(fixture.nativeElement.querySelector("router-outlet")).not.toBeNull();
    expect(fixture.nativeElement.querySelector("nexa-button")).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(
      "Active business context",
    );
  });

  it("renders only the identity and business context returned by the session", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    const session: SessionResponse = {
      user: { displayName: "Alex Rivera", email: "alex@example.test" },
      tenant: { tenantSlug: "north-distribution" },
      workspace: { workspaceSlug: "main" },
    };
    fixture.componentRef.setInput("session", session);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Alex Rivera");
    expect(fixture.nativeElement.textContent).toContain(
      "Active business context",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "Tenant: north-distribution",
    );
    expect(fixture.nativeElement.textContent).toContain("Workspace: main");
    expect(
      fixture.nativeElement.querySelector(
        'nav[aria-label="Platform navigation"]',
      ),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector("nexa-button")?.textContent,
    ).toContain("Sign out");
  });

  it("uses server session names for the active business context when present", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput("session", {
      tenant: {
        tenantName: "North Distribution",
        tenantSlug: "north-distribution",
      },
      workspace: { workspaceName: "Main Warehouse", workspaceSlug: "main" },
    } satisfies SessionResponse);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "Tenant: North Distribution (north-distribution)",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "Workspace: Main Warehouse (main)",
    );
  });

  it("shows the operational overview link only for an API-returned supported read permission", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput("session", {
      membership: { roles: ["LOGISTICS"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        'a[routerLink="/operations/overview"]',
      ),
    ).toBeNull();

    fixture.componentRef.setInput("session", {
      membership: { permissions: ["dispatch.read"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        'a[routerLink="/operations/overview"]',
      )?.textContent,
    ).toContain("Operations overview");
  });

  it("shows Sales and Fulfillment links from API permission hints, never from role names", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput("session", {
      membership: { roles: ["SALES_MANAGER", "WAREHOUSE_OPERATOR"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        'nav[aria-label="Platform navigation"]',
      ),
    ).toBeNull();

    fixture.componentRef.setInput("session", {
      membership: {
        permissions: ["sales.purchase_request.read", "fulfillment.read"],
      },
    } satisfies SessionResponse);
    fixture.detectChanges();

    const navigation = fixture.nativeElement.querySelector(
      'nav[aria-label="Platform navigation"]',
    ) as HTMLElement;
    expect(
      navigation.querySelector('a[routerLink="/sales/purchase-requests"]')
        ?.textContent,
    ).toContain("Purchase requests");
    expect(
      navigation.querySelector('a[routerLink="/fulfillment-delivery"]')
        ?.textContent,
    ).toContain("Fulfillment");
    expect(
      navigation.querySelector('a[routerLink="/operations/overview"]'),
    ).toBeNull();
  });

  it("does not treat the unsupported sales.read string as Sales authorization", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput("session", {
      membership: { permissions: ["sales.read"] },
    } satisfies SessionResponse);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        'a[routerLink="/sales/purchase-requests"]',
      ),
    ).toBeNull();
  });

  it("shows credit configuration from Platform surface and its dedicated API permission hint", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    const link = () => fixture.nativeElement.querySelector('a[routerLink="/credit-configuration"]');

    fixture.componentRef.setInput("session", {
      surface: "PLATFORM",
      membership: { roles: ["BUSINESS_OPERATIONS_MANAGER"], permissions: ["client.credit.manage"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()).toBeNull();

    fixture.componentRef.setInput("session", {
      surface: "PLATFORM",
      membership: { roles: ["TENANT_ADMIN"], permissions: ["client.credit.configuration.manage"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()?.textContent).toContain("Credit configuration");

    fixture.componentRef.setInput("session", {
      surface: "PLATFORM",
      membership: { permissions: ["client.credit.configuration.manage"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()?.textContent).toContain("Credit configuration");

    fixture.componentRef.setInput("session", {
      surface: "PORTAL",
      membership: { roles: ["COMPANY_OWNER"], permissions: ["client.credit.configuration.manage"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()).toBeNull();
  });

  it("gates workforce and role navigation independently by returned permissions", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput("session", {
      membership: { roles: ["TENANT_ADMINISTRATOR", "COMPANY_OWNER"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    const link = (path: string) =>
      fixture.nativeElement.querySelector(`a[routerLink="${path}"]`);
    expect(link("/organization/access")).toBeNull();
    expect(link("/organization/roles")).toBeNull();

    fixture.componentRef.setInput("session", {
      membership: { permissions: ["tenant.member.read"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link("/organization/access")).not.toBeNull();
    expect(link("/organization/roles")).toBeNull();

    fixture.componentRef.setInput("session", {
      membership: { permissions: ["tenant.role.read"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link("/organization/access")).toBeNull();
    expect(link("/organization/roles")).not.toBeNull();
  });

  it("shows Warehouse grant navigation from the Platform permission hint, never role labels", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    const link = () => fixture.nativeElement.querySelector(
      'a[routerLink="/organization/warehouse-access"]',
    );

    fixture.componentRef.setInput("session", {
      surface: "PLATFORM",
      membership: { roles: ["LOGISTICS"], permissions: ["tenant.role.assign"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()?.textContent).toContain("Warehouse access");

    fixture.componentRef.setInput("session", {
      surface: "PLATFORM",
      membership: { roles: ["TENANT_ADMIN"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()).toBeNull();

    fixture.componentRef.setInput("session", {
      surface: "PORTAL",
      membership: { roles: ["COMPANY_OWNER"], permissions: ["tenant.role.assign"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()).toBeNull();
  });

  it("shows support-consent navigation from returned tenant-read permission, not role labels", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    const link = () => fixture.nativeElement.querySelector(
      'a[routerLink="/organization/support-consents"]',
    );

    fixture.componentRef.setInput("session", {
      surface: "PLATFORM",
      membership: { roles: ["COMPANY_OWNER"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()).toBeNull();

    fixture.componentRef.setInput("session", {
      surface: "PLATFORM",
      membership: { permissions: ["tenant:read"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()?.textContent).toContain("Support consent");

    fixture.componentRef.setInput("session", {
      surface: "PORTAL",
      membership: { permissions: ["tenant:read"] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(link()).toBeNull();
  });

  it("uses the returned email when the session has no display name", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput("session", {
      user: { email: "alex@example.test" },
    } satisfies SessionResponse);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("alex@example.test");
  });

  it("emits sign out without applying session or authorization behavior", () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput("session", {
      user: { displayName: "Alex Rivera" },
    } satisfies SessionResponse);
    const signOut = vi.fn();
    fixture.componentInstance.signOut.subscribe(signOut);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      "nexa-button button",
    ) as HTMLButtonElement;
    button.click();

    expect(signOut).toHaveBeenCalledOnce();
  });
});
