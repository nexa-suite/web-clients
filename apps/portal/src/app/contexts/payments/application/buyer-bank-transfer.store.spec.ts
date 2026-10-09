import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { of, Subject, throwError } from "rxjs";
import { NexaApiError, NexaCommandRetryStore, NexaPaymentCommandsApi, type PaymentResponse } from "@nexa/api";
import { PortalSessionStore, type PortalSessionLease, type PortalSessionState } from "../../tenant-access-governance/application/public-api";
import { BuyerBankTransferStore } from "./buyer-bank-transfer.store";

describe("Buyer bank transfer reporting", () => {
  const lease: PortalSessionLease = { epoch: 1, scope: { userId: "buyer", tenantId: "tenant", workspaceId: "workspace", membershipId: "member", surface: "PORTAL" } };
  const payment: PaymentResponse = { id: "payment", receivableId: "receivable", status: "PROCESSING", method: "BANK_TRANSFER", amount: 50, currency: "PEN", createdAt: "2026-10-09T12:00:00Z", completedAt: null };
  let active: ReturnType<typeof signal<boolean>>;
  let sessionState: ReturnType<typeof signal<PortalSessionState>>;
  let report: ReturnType<typeof vi.fn>;
  let values: Map<string, string>;
  let writes: ReturnType<typeof vi.fn>;
  let expire: ReturnType<typeof vi.fn>;
  let store: BuyerBankTransferStore;
  beforeEach(() => {
    active = signal(true);
    sessionState = signal<PortalSessionState>({ status: "authenticated", session: { membership: { permissions: ["payment.create"] } } });
    values = new Map();
    writes = vi.fn((key: string, value: string) => values.set(key, value));
    expire = vi.fn();
    report = vi.fn(() => of(payment));
    vi.spyOn(crypto.subtle, "digest").mockResolvedValue(new Uint8Array(32).buffer);
    TestBed.configureTestingModule({ providers: [
      { provide: NexaPaymentCommandsApi, useValue: { reportBankTransfer: report } },
      { provide: NexaCommandRetryStore, useValue: { read: (key: string) => values.get(key) ?? null, write: writes } },
      { provide: PortalSessionStore, useValue: { state: sessionState, captureSessionLease: () => active() ? lease : null, isSessionLeaseCurrent: () => active(), expireSessionIfCurrent: expire, invalidateContextIfCurrent: vi.fn() } },
    ] });
    store = TestBed.inject(BuyerBankTransferStore);
    store.select("receivable");
    store.editReference("TRANSFER-1");
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows a reported transfer as processing and persists no reference or money", async () => {
    await store.submit();
    expect(store.state()?.payment?.status).toBe("PROCESSING");
    expect(store.state()?.reference).toBe("");
    expect(writes).toHaveBeenCalledOnce();
    expect(JSON.stringify(writes.mock.calls)).not.toContain("TRANSFER-1");
    expect(report.mock.calls[0][1]).toEqual({ reference: "TRANSFER-1", proofEvidenceId: null });
  });
  it("reuses command identity after an uncertain transport outcome", async () => {
    report.mockReturnValueOnce(throwError(() => new NexaApiError("network", 0, null)));
    await store.submit();
    await store.submit();
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[0][2]).toBe(report.mock.calls[1][2]);
    expect(store.state()?.payment?.status).toBe("PROCESSING");
  });
  it("does not issue a command without payment.create", async () => {
    sessionState.set({ status: "authenticated", session: { membership: { permissions: ["payment.read"] } } });
    await store.submit();
    expect(report).not.toHaveBeenCalled();
  });
  it("masks a late response and does not expire the replacement session", async () => {
    const response = new Subject<PaymentResponse>();
    report.mockReturnValue(response);
    const pending = store.submit();
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    active.set(false);
    response.error(new NexaApiError("unauthenticated", 401, null));
    await pending;
    expect(store.state()).toBeNull();
    expect(expire).not.toHaveBeenCalled();
  });
  it("does not allow a second submission while the first command is pending", async () => {
    const response = new Subject<PaymentResponse>();
    report.mockReturnValue(response);
    const pending = store.submit();
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    await store.submit();
    expect(report).toHaveBeenCalledOnce();
    response.next(payment);
    await pending;
  });
});
