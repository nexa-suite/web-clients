import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { firstValueFrom, of, Subject, throwError } from "rxjs";
import { NexaApiError, NexaBuyerDeliveriesApi, type BuyerDeliveryPageResponse, type BuyerDeliveryLiveLocationResponse } from "@nexa/api";
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
  const liveLocation: BuyerDeliveryLiveLocationResponse = {
    deliveryId: "00000000-0000-4000-8000-000000000001",
    location: {
      sampleId: "00000000-0000-4000-8000-000000000002",
      latitude: -12.0464,
      longitude: -77.0428,
      accuracyMeters: 5,
      capturedAt: "2026-10-09T12:00:00Z",
      expiresAt: "2099-10-09T12:15:00Z",
    },
  };
  const history = [{ type: "HANDED_OVER", occurredAt: "2026-10-09T12:00:00Z" }];
  let active: ReturnType<typeof signal<boolean>>;
  let list: ReturnType<typeof vi.fn>;
  let detail: ReturnType<typeof vi.fn>;
  let events: ReturnType<typeof vi.fn>;
  let readLiveLocation: ReturnType<typeof vi.fn>;
  let expire: ReturnType<typeof vi.fn>;
  let invalidate: ReturnType<typeof vi.fn>;
  let store: BuyerDeliveriesStore;
  beforeEach(() => {
    active = signal(true);
    list = vi.fn(() => of(page));
    detail = vi.fn(() => of(delivery));
    events = vi.fn(() => of(history));
    readLiveLocation = vi.fn(() => of(liveLocation));
    expire = vi.fn();
    invalidate = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: NexaBuyerDeliveriesApi, useValue: { list, detail, events, liveLocation: readLiveLocation } },
      { provide: PortalSessionStore, useValue: { captureSessionLease: () => active() ? lease : null, isSessionLeaseCurrent: () => active(), expireSessionIfCurrent: expire, invalidateContextIfCurrent: invalidate } },
    ] });
    store = TestBed.inject(BuyerDeliveriesStore);
  });
  it("loads the API detail and Buyer-safe history for the selected delivery", async () => {
    await store.detail(delivery.id);
    expect(detail).toHaveBeenCalledWith(delivery.id);
    expect(events).toHaveBeenCalledWith(delivery.id);
    expect(readLiveLocation).toHaveBeenCalledWith(delivery.id);
    expect(store.state()?.detail?.status).toBe("DISPATCHED");
    expect(store.state()?.detail?.proofOfDeliveryStatus).toBeNull();
    expect(store.state()?.events).toEqual(history);
    expect(store.state()?.liveLocation?.sampleId).toBe(liveLocation.location?.sampleId);
  });
  it("does not request a live location outside dispatched or in-transit status", async () => {
    detail.mockReturnValueOnce(of({ ...delivery, status: "SCHEDULED" }));

    await store.detail(delivery.id);

    expect(readLiveLocation).not.toHaveBeenCalled();
    expect(store.state()?.liveLocation).toBeNull();
  });
  it("masks loaded delivery facts when authority changes", async () => {
    await store.detail(delivery.id);
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

  it("clears delivery data and stops polling after the server denies read access", async () => {
    await store.list();
    list.mockReturnValueOnce(throwError(() => new NexaApiError("forbidden", 403, { code: "permission_denied" })));

    await expect(firstValueFrom(store.refreshListForPolling(lease))).resolves.toBe(false);

    expect(store.state()?.page).toBeNull();
    expect(store.state()?.detail).toBeNull();
    expect(store.state()?.error).toContain("cannot read delivery information");
    expect(active()).toBe(true);
    expect(expire).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("erases location and stops its endpoint polling after terminal 404", async () => {
    await store.detail(delivery.id);
    readLiveLocation.mockReturnValueOnce(throwError(() => new NexaApiError("not-found", 404, { code: "DELIVERY_NOT_FOUND" })));

    await expect(firstValueFrom(store.refreshDetailForPolling(delivery.id, lease))).resolves.toBe(true);

    expect(store.state()?.liveLocation).toBeNull();
    expect(store.state()?.liveTrackingTerminal).toBe(true);
    const callCount = readLiveLocation.mock.calls.length;
    await expect(firstValueFrom(store.refreshDetailForPolling(delivery.id, lease))).resolves.toBe(true);
    expect(readLiveLocation).toHaveBeenCalledTimes(callCount);
  });

  it("erases all delivery data and stops polling when the Buyer detail becomes 404", async () => {
    await store.detail(delivery.id);
    detail.mockReturnValueOnce(throwError(() => new NexaApiError("not-found", 404, { code: "DELIVERY_NOT_FOUND" })));

    await expect(firstValueFrom(store.refreshDetailForPolling(delivery.id, lease))).resolves.toBe(false);

    expect(store.state()?.detail).toBeNull();
    expect(store.state()?.events).toEqual([]);
    expect(store.state()?.liveLocation).toBeNull();
    expect(store.state()?.error).toContain("no longer available");
  });

  it("clears live location and stops polling if delivery leaves active status", async () => {
    await store.detail(delivery.id);
    detail.mockReturnValueOnce(of({ ...delivery, status: "DELIVERED" }));

    await expect(firstValueFrom(store.refreshDetailForPolling(delivery.id, lease))).resolves.toBe(true);

    expect(store.state()?.detail?.status).toBe("DELIVERED");
    expect(store.state()?.liveLocation).toBeNull();
    expect(store.state()?.liveTrackingTerminal).toBe(true);
    const callCount = readLiveLocation.mock.calls.length;
    await firstValueFrom(store.refreshDetailForPolling(delivery.id, lease));
    expect(readLiveLocation).toHaveBeenCalledTimes(callCount);
  });

  it("clears authorized data when polling live location receives 403", async () => {
    await store.detail(delivery.id);
    readLiveLocation.mockReturnValueOnce(throwError(() => new NexaApiError("forbidden", 403, { code: "permission_denied" })));

    await expect(firstValueFrom(store.refreshDetailForPolling(delivery.id, lease))).resolves.toBe(false);

    expect(store.state()?.detail).toBeNull();
    expect(store.state()?.liveLocation).toBeNull();
    expect(store.state()?.error).toContain("cannot read delivery information");
    expect(active()).toBe(true);
  });

  it("expires Buyer scope and erases delivery location after polling live location receives 401", async () => {
    await store.detail(delivery.id);
    readLiveLocation.mockReturnValueOnce(throwError(() => new NexaApiError("unauthenticated", 401, null)));

    await expect(firstValueFrom(store.refreshDetailForPolling(delivery.id, lease))).resolves.toBe(false);

    expect(expire).toHaveBeenCalledWith(lease);
    expect(store.state()).toBeNull();
  });

  it("erases an in-flight delivery state when its session scope changes", async () => {
    await store.detail(delivery.id);
    active.set(false);

    store.clearForStaleScope(lease);

    expect(store.state()).toBeNull();
  });

  it("treats an active delivery with no server sample as no map location", async () => {
    readLiveLocation.mockReturnValueOnce(of({ deliveryId: delivery.id, location: null }));

    await store.detail(delivery.id);

    expect(store.state()?.liveLocation).toBeNull();
    expect(store.state()?.liveTrackingTerminal).toBe(false);
  });

  it("does not retain another delivery's location or an expired sample", async () => {
    readLiveLocation.mockReturnValueOnce(of({ ...liveLocation, deliveryId: "00000000-0000-4000-8000-000000000099" }));
    await store.detail(delivery.id);
    expect(store.state()?.liveLocation).toBeNull();
    expect(store.state()?.liveTrackingTerminal).toBe(true);

    detail.mockReturnValueOnce(of(delivery));
    readLiveLocation.mockReturnValueOnce(of({
      deliveryId: delivery.id,
      location: { ...liveLocation.location!, expiresAt: "2020-01-01T00:00:00Z" },
    }));
    await store.detail(delivery.id);
    expect(store.state()?.liveLocation).toBeNull();
    expect(store.state()?.liveTrackingTerminal).toBe(false);
  });

  it("expires and clears the captured Buyer session when polling receives 401", async () => {
    await store.list();
    list.mockReturnValueOnce(throwError(() => new NexaApiError("unauthenticated", 401, null)));

    await expect(firstValueFrom(store.refreshListForPolling(lease))).resolves.toBe(false);

    expect(expire).toHaveBeenCalledWith(lease);
    expect(store.state()).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
