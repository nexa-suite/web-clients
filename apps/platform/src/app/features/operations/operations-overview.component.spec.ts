import {
  Component,
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { NexaApiError, NexaLogisticsApi } from "@nexa/api";
import { of, Subject, throwError } from "rxjs";
import type { PlatformSessionLease } from "../../contexts/tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../contexts/tenant-access-governance/application/public-api";
import { PlatformOperationsOverviewComponent } from "./operations-overview.component";

@Component({ standalone: true, template: "<p>Sign in route</p>" })
class SignInRouteStubComponent {}

describe("PlatformOperationsOverviewComponent", () => {
  const response = {
    readyForOperations: 1,
    preparing: 2,
    assigned: 3,
    scheduled: 4,
    readyForRoute: 5,
    inRoute: 6,
    incidents: 7,
    deliveredToday: 8,
    temperatureAlerts: 9,
    podPending: 10,
    reservationsReady: 11,
  };
  const lease: PlatformSessionLease = {
    epoch: 3,
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-1",
      surface: "PLATFORM",
    },
  };
  let getOperationsDashboard: ReturnType<typeof vi.fn>;
  let captureSessionLease: ReturnType<typeof vi.fn>;
  let isSessionLeaseCurrent: ReturnType<typeof vi.fn>;
  let expireSessionIfCurrent: ReturnType<typeof vi.fn>;
  let invalidateContextIfCurrent: ReturnType<typeof vi.fn>;
  let sessionState: WritableSignal<{ readonly status: string }>;
  let activeEpoch: number;

  beforeEach(async () => {
    getOperationsDashboard = vi.fn(() => of(response));
    sessionState = signal({ status: "authenticated" });
    activeEpoch = lease.epoch;
    captureSessionLease = vi.fn(() =>
      sessionState().status === "authenticated"
        ? { ...lease, epoch: activeEpoch }
        : null,
    );
    isSessionLeaseCurrent = vi.fn(
      (candidate: PlatformSessionLease) =>
        sessionState().status === "authenticated" &&
        candidate.epoch === activeEpoch,
    );
    expireSessionIfCurrent = vi.fn(() => true);
    invalidateContextIfCurrent = vi.fn(() => true);
    await TestBed.configureTestingModule({
      imports: [PlatformOperationsOverviewComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: "sign-in", component: SignInRouteStubComponent },
        ]),
        { provide: NexaLogisticsApi, useValue: { getOperationsDashboard } },
        {
          provide: PlatformSessionStore,
          useValue: {
            state: sessionState,
            captureSessionLease,
            isSessionLeaseCurrent,
            expireSessionIfCurrent,
            invalidateContextIfCurrent,
          },
        },
      ],
    }).compileComponents();
  });

  it("loads the server metrics as a read-only presentation projection", () => {
    const fixture = TestBed.createComponent(
      PlatformOperationsOverviewComponent,
    );
    fixture.detectChanges();

    expect(captureSessionLease).toHaveBeenCalledOnce();
    expect(getOperationsDashboard).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain("Operations overview");
    expect(fixture.nativeElement.textContent).toContain("Ready for operations");
    expect(fixture.nativeElement.textContent).toContain(
      "Proof of delivery pending",
    );
    expect(fixture.nativeElement.textContent).toContain("11");
    expect(
      fixture.nativeElement.querySelectorAll(".operations-overview__metric"),
    ).toHaveLength(11);
    expect(fixture.nativeElement.querySelectorAll("button")).toHaveLength(1);
  });

  it("shows an ordinary forbidden state without exposing server detail or invalidating context", () => {
    getOperationsDashboard.mockReturnValueOnce(
      throwError(
        () =>
          new NexaApiError("forbidden", 403, {
            code: "OPERATION_NOT_ALLOWED",
            detail: "permission role internals must not reach the page",
          }),
      ),
    );
    const fixture = TestBed.createComponent(
      PlatformOperationsOverviewComponent,
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "not available for the current business context",
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      "permission role internals",
    );
    expect(
      fixture.nativeElement.querySelector('[role="alert"]'),
    ).not.toBeNull();
    expect(invalidateContextIfCurrent).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).not.toContain("/sign-in");
    expect(fixture.nativeElement.querySelectorAll("button")).toHaveLength(0);
  });

  it("expires only the captured session after an unauthorized read", async () => {
    getOperationsDashboard.mockReturnValueOnce(
      throwError(
        () =>
          new NexaApiError("unauthenticated", 401, {
            detail: "expired bearer",
          }),
      ),
    );
    const fixture = TestBed.createComponent(
      PlatformOperationsOverviewComponent,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(expireSessionIfCurrent).toHaveBeenCalledWith(lease);
    expect(TestBed.inject(Router).url).toContain("/sign-in");
    expect(fixture.nativeElement.textContent).not.toContain("expired bearer");
  });

  it("invalidates the captured context only for ACCESS_CONTEXT_INVALID", async () => {
    getOperationsDashboard.mockReturnValueOnce(
      throwError(
        () =>
          new NexaApiError("forbidden", 403, {
            code: "ACCESS_CONTEXT_INVALID",
          }),
      ),
    );
    const fixture = TestBed.createComponent(
      PlatformOperationsOverviewComponent,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(invalidateContextIfCurrent).toHaveBeenCalledWith(lease);
    expect(expireSessionIfCurrent).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toContain("/sign-in");
  });

  it("discards a late successful response after the active session changes", () => {
    const pending = new Subject<typeof response>();
    getOperationsDashboard.mockReturnValueOnce(pending.asObservable());
    const fixture = TestBed.createComponent(
      PlatformOperationsOverviewComponent,
    );
    fixture.detectChanges();
    isSessionLeaseCurrent.mockReturnValue(false);

    pending.next(response);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll(".operations-overview__metric"),
    ).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain(
      "The active session changed",
    );
  });

  it("clears ready metrics immediately when the session lease changes", () => {
    const fixture = TestBed.createComponent(
      PlatformOperationsOverviewComponent,
    );
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll(".operations-overview__metric"),
    ).toHaveLength(11);

    sessionState.set({ status: "selecting-context" });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll(".operations-overview__metric"),
    ).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain(
      "The active session changed",
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      "Ready for operations",
    );

    sessionState.set({ status: "authenticated" });
    activeEpoch++;
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll(".operations-overview__metric"),
    ).toHaveLength(0);
    expect(
      fixture.nativeElement.querySelector("button")?.textContent,
    ).toContain("Try again");

    (
      fixture.nativeElement.querySelector("button") as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll(".operations-overview__metric"),
    ).toHaveLength(11);

    sessionState.set({ status: "signing-out" });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll(".operations-overview__metric"),
    ).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain(
      "The active session changed",
    );
  });

  it("does not let a stale 401 expire a newer session", async () => {
    const pending = new Subject<typeof response>();
    getOperationsDashboard.mockReturnValueOnce(pending.asObservable());
    const fixture = TestBed.createComponent(
      PlatformOperationsOverviewComponent,
    );
    fixture.detectChanges();
    isSessionLeaseCurrent.mockReturnValue(false);

    pending.error(
      new NexaApiError("unauthenticated", 401, { detail: "stale response" }),
    );
    await fixture.whenStable();

    expect(expireSessionIfCurrent).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).not.toContain("/sign-in");
    expect(fixture.nativeElement.textContent).toContain(
      "The active session changed",
    );
  });

  it("fails closed without dispatching when the API session has no complete scope", () => {
    captureSessionLease.mockReturnValue(null);
    const fixture = TestBed.createComponent(
      PlatformOperationsOverviewComponent,
    );
    fixture.detectChanges();

    expect(getOperationsDashboard).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      "complete current Platform context is required",
    );
  });

  it("retries only the safe dashboard read after a recoverable failure", () => {
    getOperationsDashboard
      .mockReturnValueOnce(
        throwError(() => new NexaApiError("network", 0, null)),
      )
      .mockReturnValueOnce(of(response));
    const fixture = TestBed.createComponent(
      PlatformOperationsOverviewComponent,
    );
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector(
      "button",
    ) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();

    expect(getOperationsDashboard).toHaveBeenCalledTimes(2);
    expect(
      fixture.nativeElement.querySelectorAll(".operations-overview__metric"),
    ).toHaveLength(11);
  });
});
