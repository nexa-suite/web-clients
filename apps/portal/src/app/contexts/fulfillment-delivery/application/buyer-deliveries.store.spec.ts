import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { of, Subject, throwError } from "rxjs";
import { NexaApiError, NexaBuyerDeliveriesApi, type BuyerDeliveryPageResponse } from "@nexa/api";
import { PortalSessionStore, type PortalSessionLease } from "../../tenant-access-governance/application/public-api";
import { BuyerDeliveriesStore } from "./buyer-deliveries.store";

describe("Buyer deliveries authority fencing", () => {
  const lease: PortalSessionLease = { epoch: 1, scope: { userId: "buyer", tenantId: "tenant", workspaceId: "workspace", membershipId: "member", surface: "PORTAL" } };
  const page: BuyerDeliveryPageResponse = { items: [], page: 0, size: 25, total: 0 };
  const delivery = {
    id: "00000000-0000-4000-8000-000000000001",
    salesOrderNumber: "SO-0001",
    status: "DISPATCHED",
    destination: "Sucursal principal",
    scheduledAt: null,
    dispatchedAt: "2026-10-09T12:00:00Z",
    deliveredAt: null,
    proofOfDeliveryStatus: null,
    version: 3,
    createdAt: "2026-10-09T11:00:00Z",
    updatedAt: "2026-10-09T12:05:00Z",
  };
  const history = [{ type: "HANDED_OVER", occurredAt: "2026-10-09T12:00:00Z" }];
  let active: ReturnType<typeof signal<boolean>>;
  let list: ReturnType<typeof vi.fn>;
  let detail: ReturnType<typeof vi.fn>;
  let events: ReturnType<typeof vi.fn>;
  let expire: ReturnType<typeof vi.fn>;
  let invalidate: ReturnType<typeof vi.fn>;
  let store: BuyerDeliveriesStore;
  beforeEach(() => {
    active = signal(true);
    list = vi.fn(() => of(page));
    detail = vi.fn(() => of(delivery));
    events = vi.fn(() => of(history));
    expire = vi.fn();
    invalidate = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: NexaBuyerDeliveriesApi, useValue: { list, detail, events } },
      { provide: PortalSessionStore, useValue: { captureSessionLease: () => active() ? lease : null, isSessionLeaseCurrent: () => active(), expireSessionIfCurrent: expire, invalidateContextIfCurrent: invalidate } },
    ] });
    store = TestBed.inject(BuyerDeliveriesStore);
  });
  it("loads the API detail and Buyer-safe history for the selected delivery", async () => {
    await store.detail("delivery");
    expect(detail).toHaveBeenCalledWith("delivery");
    expect(events).toHaveBeenCalledWith("delivery");
    expect(store.state()?.detail?.status).toBe("DISPATCHED");
    expect(store.state()?.detail?.proofOfDeliveryStatus).toBeNull();
    expect(store.state()?.events).toEqual(history);
  });
  it("masks loaded delivery facts when authority changes", async () => {
    await store.detail("delivery");
    active.set(false);
    expect(store.state()).toBeNull();
  });
  it("ignores a previous page that completes after a newer query", async () => {
    const previous = new Subject<BuyerDeliveryPageResponse>();
    list.mockReturnValueOnce(previous);
    const pending = store.list(0);
    list.mockReturnValueOnce(of({ ...page, page: 1 }));
    await store.list(1);
    previous.next(page);
    await pending;
    expect(store.state()?.page?.page).toBe(1);
  });
  it("does not expire a replacement session after a stale response", async () => {
    const response = new Subject<BuyerDeliveryPageResponse>();
    list.mockReturnValue(response);
    const pending = store.list();
    active.set(false);
    response.error(new NexaApiError("unauthenticated", 401, null));
    await pending;
    expect(expire).not.toHaveBeenCalled();
    expect(store.state()).toBeNull();
  });
  it("invalidates only the captured context on ACCESS_CONTEXT_INVALID", async () => {
    list.mockReturnValue(throwError(() => new NexaApiError("forbidden", 403, { code: "ACCESS_CONTEXT_INVALID" })));
    await store.list();
    expect(invalidate).toHaveBeenCalledWith(lease);
    expect(expire).not.toHaveBeenCalled();
  });

  it("keeps the session active when the server denies the tracking capability", async () => {
    detail.mockReturnValue(throwError(() => new NexaApiError("forbidden", 403, { code: "permission_denied" })));
    await store.detail(delivery.id);
    expect(store.state()?.error).toContain("current Buyer context");
    expect(active()).toBe(true);
    expect(expire).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
