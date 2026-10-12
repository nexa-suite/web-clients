import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import {
  NexaApiError,
  NexaCommandRetryStore,
  NexaWalletRefundsApi,
} from "@nexa/api";
import type {
  WalletRefundCandidate,
  WalletRefundCandidatesPage,
  WalletRefundResponse,
} from "@nexa/api";
import { of, Subject, throwError } from "rxjs";
import type {
  PlatformSessionLease,
  PlatformSessionState,
} from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformWalletRefundsPageComponent } from "./platform-wallet-refunds-page.component";

interface PageTestAccess {
  canRefund(): boolean;
  candidates(): {
    readonly status: string;
    readonly page?: WalletRefundCandidatesPage;
  };
  selectedCandidate(): WalletRefundCandidate | null;
  pending(): unknown;
  amount(): string;
  reason(): string;
  loadCandidates(page?: number): Promise<void>;
  selectCandidate(candidate: WalletRefundCandidate): void;
  setAmount(event: Event): void;
  useFullRefund(): void;
  setReason(event: Event): void;
  submitRefund(): Promise<void>;
  retrySameRefund(): Promise<void>;
}

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

const candidate: WalletRefundCandidate = {
  salesOrderId: "order/1",
  orderNumber: "SO-001",
  currency: "PEN",
  consumedPEN: 125.5,
  refundedPEN: 25,
  refundablePEN: 100.5,
};

const candidatesPage: WalletRefundCandidatesPage = {
  items: [candidate],
  page: 0,
  size: 25,
  total: 1,
};

const refundResponse: WalletRefundResponse = {
  salesOrderId: candidate.salesOrderId,
  refundId: "refund-1",
  ledgerEntryId: "ledger-1",
  amountPEN: 25.5,
  currency: "PEN",
  status: "POSTED",
};

function valueEvent(value: string): Event {
  return { target: { value } } as unknown as Event;
}

function authenticatedState(
  roles = ["BUSINESS_OPERATIONS_MANAGER"],
  permissions = ["payment.reconcile"],
  surface: "PLATFORM" | "PORTAL" = "PLATFORM",
): PlatformSessionState {
  return {
    status: "authenticated",
    session: { surface, membership: { roles, permissions } },
  };
}

function installCrypto(): void {
  vi.stubGlobal("crypto", {
    subtle: {
      digest: vi.fn(async () => new Uint8Array(32).fill(5).buffer),
    },
    randomUUID: vi.fn(() => "123e4567-e89b-42d3-a456-426614174020"),
  });
}

describe("PlatformWalletRefundsPageComponent", () => {
  let api: {
    candidates: ReturnType<typeof vi.fn>;
    refund: ReturnType<typeof vi.fn>;
  };
  let values: Map<string, string>;
  let retries: {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let sessionState: ReturnType<typeof signal<PlatformSessionState>>;
  let currentLease: PlatformSessionLease | null;
  let fixture: ReturnType<
    typeof TestBed.createComponent<PlatformWalletRefundsPageComponent>
  >;
  let component: PageTestAccess;

  beforeEach(() => {
    currentLease = lease;
    values = new Map();
    api = {
      candidates: vi.fn(() => of(candidatesPage)),
      refund: vi.fn(() => of(refundResponse)),
    };
    retries = {
      read: vi.fn((key: string) => values.get(key) ?? null),
      write: vi.fn((key: string, value: string) => values.set(key, value)),
      remove: vi.fn((key: string) => values.delete(key)),
    };
    sessionState = signal<PlatformSessionState>(authenticatedState());
    TestBed.configureTestingModule({
      imports: [PlatformWalletRefundsPageComponent],
      providers: [
        { provide: NexaWalletRefundsApi, useValue: api },
        { provide: NexaCommandRetryStore, useValue: retries },
        {
          provide: PlatformSessionStore,
          useValue: {
            state: sessionState,
            captureSessionLease: vi.fn(() => currentLease),
            isSessionLeaseCurrent: vi.fn(
              (candidateLease: PlatformSessionLease) =>
                sameLeaseForTest(candidateLease, currentLease),
            ),
            expireSessionIfCurrent: vi.fn(() => true),
            invalidateContextIfCurrent: vi.fn(() => true),
          },
        },
        {
          provide: Router,
          useValue: { url: "/wallet-refunds", navigate: vi.fn() },
        },
      ],
    });
    fixture = TestBed.createComponent(PlatformWalletRefundsPageComponent);
    component = fixture.componentInstance as unknown as PageTestAccess;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("loads no candidates unless the current Platform role and payment.reconcile permission are present", async () => {
    sessionState.set(
      authenticatedState(["SALES"], ["payment.reconcile"], "PLATFORM"),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.canRefund()).toBe(false);
    expect(api.candidates).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      "Company Owner or Business Operations Manager",
    );
  });

  it("preserves all four server decimal places for a full refund", async () => {
    installCrypto();
    const precise = { ...candidate, consumedPEN: 12.3456, refundedPEN: 0, refundablePEN: 12.3456 };
    api.candidates.mockReturnValue(of({ ...candidatesPage, items: [precise] }));
    api.refund.mockReturnValue(of({ ...refundResponse, amountPEN: 12.3456 }));
    fixture.detectChanges();
    await fixture.whenStable();
    component.selectCandidate(precise);
    component.useFullRefund();
    component.setReason(valueEvent("Cancelled order"));
    expect(component.amount()).toBe("12.3456");
    await component.submitRefund();
    expect(api.refund).toHaveBeenCalledWith("order/1", { amountPEN: 12.3456, reason: "Cancelled order" }, expect.any(String));
  });

  it("posts the exact command and renders refreshed amounts returned by the API", async () => {
    installCrypto();
    const refreshedPage: WalletRefundCandidatesPage = {
      items: [
        {
          ...candidate,
          refundedPEN: 50.5,
          refundablePEN: 80,
        },
      ],
      page: 0,
      size: 25,
      total: 1,
    };
    api.candidates
      .mockReturnValueOnce(of(candidatesPage))
      .mockReturnValueOnce(of(refreshedPage));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectCandidate(candidate);
    component.setAmount(valueEvent("25.50"));
    component.setReason(valueEvent("  Duplicate debit  "));
    await component.submitRefund();
    fixture.detectChanges();

    expect(api.refund).toHaveBeenCalledOnce();
    expect(api.refund).toHaveBeenCalledWith(
      "order/1",
      { amountPEN: 25.5, reason: "Duplicate debit" },
      "123e4567-e89b-42d3-a456-426614174020",
    );
    expect(api.candidates).toHaveBeenCalledTimes(2);
    expect(api.candidates).toHaveBeenNthCalledWith(2, 0, 25);
    expect(component.selectedCandidate()?.refundablePEN).toBe(80);
    expect(fixture.nativeElement.textContent).toContain("PEN 80.00");
    expect(fixture.nativeElement.textContent).not.toContain("PEN 105.00");
    expect(fixture.nativeElement.textContent).toContain(
      "Candidate balances were refreshed from the API.",
    );
    expect(retries.remove).toHaveBeenCalledOnce();
  });

  it("retries an uncertain post with the identical payload and idempotency key", async () => {
    installCrypto();
    api.refund
      .mockReturnValueOnce(
        throwError(() => new NexaApiError("network", 0, null)),
      )
      .mockReturnValueOnce(of(refundResponse));
    fixture.detectChanges();
    await fixture.whenStable();
    component.selectCandidate(candidate);
    component.setAmount(valueEvent("25.50"));
    component.setReason(valueEvent("Duplicate debit"));

    await component.submitRefund();
    expect(component.pending()).not.toBeNull();
    await component.retrySameRefund();

    expect(api.refund).toHaveBeenNthCalledWith(
      1,
      "order/1",
      { amountPEN: 25.5, reason: "Duplicate debit" },
      "123e4567-e89b-42d3-a456-426614174020",
    );
    expect(api.refund).toHaveBeenNthCalledWith(
      2,
      "order/1",
      { amountPEN: 25.5, reason: "Duplicate debit" },
      "123e4567-e89b-42d3-a456-426614174020",
    );
    expect(component.pending()).toBeNull();
    expect(api.candidates).toHaveBeenCalledTimes(2);
  });

  it("drops an in-flight candidate response after membership authorization changes", async () => {
    const response = new Subject<WalletRefundCandidatesPage>();
    api.candidates.mockReturnValue(response);
    fixture.detectChanges();
    expect(api.candidates).toHaveBeenCalledOnce();

    sessionState.set(authenticatedState(["BUSINESS_OPERATIONS_MANAGER"], []));
    fixture.detectChanges();
    response.next(candidatesPage);
    response.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.canRefund()).toBe(false);
    expect(component.candidates().status).toBe("idle");
    expect(component.selectedCandidate()).toBeNull();
    expect(api.refund).not.toHaveBeenCalled();
  });

  it("clears a selected refund when the current membership loses permission", async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    component.selectCandidate(candidate);
    component.setAmount(valueEvent("25.50"));
    component.setReason(valueEvent("Duplicate debit"));

    sessionState.set(authenticatedState(["BUSINESS_OPERATIONS_MANAGER"], []));
    fixture.detectChanges();

    expect(component.canRefund()).toBe(false);
    expect(component.candidates().status).toBe("idle");
    expect(component.selectedCandidate()).toBeNull();
    expect(component.amount()).toBe("");
    expect(component.reason()).toBe("");
    expect(api.refund).not.toHaveBeenCalled();
  });
});

function sameLeaseForTest(
  left: PlatformSessionLease | null,
  right: PlatformSessionLease | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.epoch === right.epoch &&
    left.scope.userId === right.scope.userId &&
    left.scope.tenantId === right.scope.tenantId &&
    left.scope.workspaceId === right.scope.workspaceId &&
    left.scope.membershipId === right.scope.membershipId &&
    left.scope.surface === right.scope.surface
  );
}
