import { signal, type WritableSignal } from "@angular/core";
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { Subject, of } from "rxjs";
import type { AccessContextResponse, SessionResponse } from "@nexa/api";
import {
  PlatformSessionStore,
  type PlatformSessionLease,
  type PlatformSessionState,
} from "../../application/platform-session.store";
import { PlatformActiveContextComponent } from "./platform-active-context.component";

describe("PlatformActiveContextComponent", () => {
  let fixture: ComponentFixture<PlatformActiveContextComponent>;
  let sessionState: WritableSignal<PlatformSessionState>;
  let sessionStore: {
    state: WritableSignal<PlatformSessionState>;
    captureSessionLease: ReturnType<typeof vi.fn>;
    isSessionLeaseCurrent: ReturnType<typeof vi.fn>;
    listAccessContexts: ReturnType<typeof vi.fn>;
    selectAccessContext: ReturnType<typeof vi.fn>;
  };

  const currentSession: SessionResponse = {
    user: { userId: "user-1", displayName: "Owner" },
    tenant: {
      tenantId: "tenant-1",
      tenantName: "Tenant One",
      tenantSlug: "tenant-one",
    },
    workspace: {
      workspaceId: "workspace-1",
      workspaceName: "Workspace One",
      workspaceSlug: "workspace-one",
    },
    membership: {
      membershipId: "membership-1",
      roles: ["COMPANY_OWNER"],
      permissions: ["tenant.read"],
    },
    surface: "PLATFORM",
  };

  const switchedSession: SessionResponse = {
    user: { userId: "user-1", displayName: "Owner" },
    tenant: {
      tenantId: "tenant-2",
      tenantName: "Tenant Two",
      tenantSlug: "tenant-two",
    },
    workspace: {
      workspaceId: "workspace-2",
      workspaceName: "Workspace Two",
      workspaceSlug: "workspace-two",
    },
    membership: {
      membershipId: "membership-2",
      roles: ["COMPANY_OWNER"],
      permissions: ["tenant.read"],
    },
    surface: "PLATFORM",
  };

  const currentContext: AccessContextResponse = {
    membershipId: "membership-1",
    tenantId: "tenant-1",
    tenantName: "Tenant One",
    tenantSlug: "tenant-one",
    workspaceId: "workspace-1",
    workspaceName: "Workspace One",
    workspaceSlug: "workspace-one",
  };

  const alternateContext: AccessContextResponse = {
    membershipId: "membership-2",
    tenantId: "tenant-2",
    tenantName: "Tenant Two",
    tenantSlug: "tenant-two",
    workspaceId: "workspace-2",
    workspaceName: "Workspace Two",
    workspaceSlug: "workspace-two",
  };

  beforeEach(async () => {
    sessionState = signal<PlatformSessionState>({ status: "idle" });
    const lease: PlatformSessionLease = {
      epoch: 1,
      scope: {
        userId: "user-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        surface: "PLATFORM",
      },
    };
    sessionStore = {
      state: sessionState,
      captureSessionLease: vi.fn(() => lease),
      isSessionLeaseCurrent: vi.fn(() => true),
      listAccessContexts: vi.fn(() => of([currentContext])),
      selectAccessContext: vi.fn(() => of(currentSession)),
    };

    await TestBed.configureTestingModule({
      imports: [PlatformActiveContextComponent],
      providers: [
        provideRouter([]),
        { provide: PlatformSessionStore, useValue: sessionStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformActiveContextComponent);
  });

  it("lists contexts only after authentication and keeps the single current context selectable", async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(sessionStore.listAccessContexts).not.toHaveBeenCalled();

    sessionState.set({ status: "authenticated", session: currentSession });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(sessionStore.listAccessContexts).toHaveBeenCalledOnce();
    const select = fixture.nativeElement.querySelector(
      '[data-testid="eligible-context-select"]',
    ) as HTMLSelectElement;
    expect(select.labels?.[0]?.textContent?.trim()).toBe(
      "Eligible business context",
    );
    expect(select.value).toBe("membership-1");
    expect(select.options).toHaveLength(2);
    expect(select.options[1].textContent).toContain("Tenant One");
    const submit = fixture.nativeElement.querySelector(
      '[data-testid="select-access-context-button"] button',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("submits the selected membership through the store and blocks another command while it is pending", async () => {
    sessionStore.listAccessContexts.mockReturnValue(
      of([currentContext, alternateContext]),
    );
    const selection = new Subject<SessionResponse>();
    sessionStore.selectAccessContext.mockImplementation(
      (membershipId: string) => {
        sessionState.set({
          status: "selecting-context",
          session: currentSession,
        });
        return selection.asObservable();
      },
    );

    sessionState.set({ status: "authenticated", session: currentSession });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      '[data-testid="eligible-context-select"]',
    ) as HTMLSelectElement;
    select.value = "membership-2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector(
      ".context-selection-form",
    ) as HTMLFormElement;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(sessionStore.selectAccessContext).toHaveBeenCalledWith(
      "membership-2",
    );
    const submit = fixture.nativeElement.querySelector(
      '[data-testid="select-access-context-button"] button',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute("aria-busy")).toBe("true");

    sessionState.set({ status: "authenticated", session: switchedSession });
    selection.next(switchedSession);
    selection.complete();
  });
});
