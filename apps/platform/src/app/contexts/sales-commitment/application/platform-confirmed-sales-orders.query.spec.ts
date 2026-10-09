import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { NexaSalesCommitmentApi } from "@nexa/api";
import type { SalesOrder } from "@nexa/api";
import { PlatformConfirmedSalesOrdersQuery } from "./platform-confirmed-sales-orders.query";

describe("PlatformConfirmedSalesOrdersQuery", () => {
  const order = (overrides: Partial<SalesOrder> = {}): SalesOrder => ({
    id: "sales-order-1",
    number: "SO-2026-001",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    clientAccountId: "account-1",
    createdByMembershipId: "membership-1",
    buyerMembershipId: null,
    sourcePurchaseRequestId: null,
    priority: "NORMAL",
    requestedDeliveryDate: "2026-10-20",
    deliverySnapshot: null,
    paymentOption: null,
    notes: null,
    currency: "USD",
    total: "10.00",
    status: "IN_FULFILLMENT",
    createdAt: "2026-10-09T10:00:00Z",
    updatedAt: "2026-10-09T10:00:00Z",
    confirmedAt: "2026-10-09T10:00:00Z",
    rejectedAt: null,
    cancelledAt: null,
    rejectionReason: null,
    version: 2,
    lines: [],
    originType: "DIRECT_ORDER",
    commercialCommitmentId: null,
    ...overrides,
  });

  let api: {
    listSalesOrders: ReturnType<typeof vi.fn>;
    getSalesOrder: ReturnType<typeof vi.fn>;
  };
  let query: PlatformConfirmedSalesOrdersQuery;

  beforeEach(() => {
    api = {
      listSalesOrders: vi.fn().mockReturnValue(
        of({
          items: [order(), order({ id: "draft-order", confirmedAt: null })],
          page: 0,
          size: 25,
          total: 26,
        }),
      ),
      getSalesOrder: vi.fn().mockReturnValue(of({ body: order() })),
    };
    TestBed.configureTestingModule({
      providers: [
        PlatformConfirmedSalesOrdersQuery,
        { provide: NexaSalesCommitmentApi, useValue: api },
      ],
    });
    query = TestBed.inject(PlatformConfirmedSalesOrdersQuery);
  });

  afterEach(() => TestBed.resetTestingModule());

  it("lists only orders with a persisted confirmation timestamp and preserves pagination", async () => {
    const result = await query.list(0);

    expect(api.listSalesOrders).toHaveBeenCalledWith({ page: 0, size: 25 });
    expect(result).toEqual({
      items: [
        {
          id: "sales-order-1",
          number: "SO-2026-001",
          status: "IN_FULFILLMENT",
          confirmedAt: "2026-10-09T10:00:00Z",
        },
      ],
      page: 0,
      size: 25,
      total: 26,
      totalPages: 2,
    });
  });

  it("does not reject an order whose lifecycle advanced after confirmation", async () => {
    api.getSalesOrder.mockReturnValueOnce(
      of({ body: order({ status: "DELIVERED" }) }),
    );

    await expect(query.get("sales-order-1")).resolves.toMatchObject({
      id: "sales-order-1",
      status: "DELIVERED",
      confirmedAt: "2026-10-09T10:00:00Z",
    });
  });

  it("returns no candidate for an order that was never confirmed", async () => {
    api.getSalesOrder.mockReturnValueOnce(
      of({ body: order({ status: "DRAFT", confirmedAt: null }) }),
    );

    await expect(query.get("draft-order")).resolves.toBeNull();
  });
});
