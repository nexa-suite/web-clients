import {
  Component,
  provideZonelessChangeDetection,
  signal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NexaApiError, NexaCommandRetryStore } from "@nexa/api";
import { of, throwError } from "rxjs";
import type { PlatformSessionState } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import {
  NexaFulfillmentDeliveryApi,
  NexaFulfillmentReadinessApi,
} from "@nexa/api";
import { PlatformFulfillmentDeliveryComponent } from "./platform-fulfillment-delivery.component";

@Component({ standalone: true, template: "<p>Sign in route</p>" })
class SignInRouteStubComponent {}

describe("PlatformFulfillmentDeliveryComponent", () => {
  const lease = {
    epoch: 2,
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-1",
      surface: "PLATFORM" as const,
    },
  };
  const candidates = {
    items: [
      {
        id: "order-1",
        number: "SO-1001",
        clientAccountId: "client-1",
        status: "AWAITING_INVENTORY_RESERVATION",
        version: 4,
        lines: [
          {
            catalogItemId: "item-1",
            itemName: "Apples",
            quantity: 3,
            unit: "crate",
          },
        ],
      },
    ],
    page: 0,
    size: 25,
    total: 1,
  };
  const order = {
    id: "order-1",
    number: "SO-1001",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    clientAccountId: "client-1",
    createdByMembershipId: "membership-1",
    buyerMembershipId: "buyer-1",
    sourcePurchaseRequestId: null,
    priority: "NORMAL",
    requestedDeliveryDate: "2026-10-10",
    deliverySnapshot: null,
    paymentOption: "CREDIT",
    notes: null,
    currency: "PEN",
    total: 100,
    status: "CONFIRMED",
    createdAt: "2026-10-09T10:00:00Z",
    updatedAt: "2026-10-09T10:00:00Z",
    confirmedAt: "2026-10-09T10:00:00Z",
    rejectedAt: null,
    cancelledAt: null,
    rejectionReason: null,
    version: 4,
    lines: [
      {
        catalogItemId: "item-1",
        itemName: "Apples",
        presentation: "Crate",
        quantity: 3,
        unit: "crate",
        unitPriceAmount: 33.33,
        unitPriceCurrency: "PEN",
        lineSubtotal: 100,
        skuId: "sku-1",
        familyId: null,
        skuCode: "APL",
        familyCode: null,
      },
    ],
    originType: "DIRECT_ORDER",
    commercialCommitmentId: "commitment-1",
  };
  const work = {
    items: [
      {
        fulfillmentId: "fulfillment-1",
        salesOrderId: "order-1",
        status: "ALLOCATED",
        version: 1,
        physicalAllocationId: "allocation-1",
        allocationVersion: 1,
        lineCount: 1,
      },
    ],
    page: 0,
    size: 25,
    totalItems: 1,
    asOf: "2026-10-09T10:00:00Z",
  };
  const readiness = {
    items: [
      {
        subjectKind: "PREPARED_FULFILLMENT",
        fulfillmentId: "fulfillment-1",
        fulfillmentVersion: 1,
        fulfillmentStatus: "ALLOCATED",
        physicalAllocationId: "allocation-1",
        physicalAllocationStatus: "ALLOCATED",
        physicalAllocationVersion: 1,
        deliveryId: "delivery-1",
        deliveryStatus: "PLANNED",
        deliveryVersion: 1,
        windowStart: null,
        windowEnd: null,
        windowSource: null,
        allocationComplete: true,
        pickingComplete: false,
        pickingEvidenceComplete: false,
        ready: false,
        reasons: ["PICKING_INCOMPLETE"],
        lines: [],
        asOf: "2026-10-09T10:00:00Z",
      },
    ],
    page: 0,
    size: 25,
    totalItems: 1,
    asOf: "2026-10-09T10:00:00Z",
  };
  let listOrderFulfillmentCandidates: ReturnType<typeof vi.fn>;
  let listFulfillmentWork: ReturnType<typeof vi.fn>;
  let listDispatchReadiness: ReturnType<typeof vi.fn>;
  let getSalesOrder: ReturnType<typeof vi.fn>;
  let getFulfillment: ReturnType<typeof vi.fn>;
  let getPhysicalAllocation: ReturnType<typeof vi.fn>;
  let startFulfillment: ReturnType<typeof vi.fn>;
  let retryValues: Map<string, string>;
  let commandRetryRead: ReturnType<typeof vi.fn>;
  let commandRetryWrite: ReturnType<typeof vi.fn>;
  let commandRetryRemove: ReturnType<typeof vi.fn>;
  let sessionState: ReturnType<typeof signal<PlatformSessionState>>;
  let activeEpoch: number;

  beforeEach(async () => {
    retryValues = new Map();
    commandRetryRead = vi.fn((key: string) => retryValues.get(key) ?? null);
    commandRetryWrite = vi.fn((key: string, value: string) =>
      retryValues.set(key, value),
    );
    commandRetryRemove = vi.fn((key: string) => retryValues.delete(key));
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "123e4567-e89b-42d3-a456-426614174000"),
    });
    listOrderFulfillmentCandidates = vi.fn(() => of(candidates));
    listFulfillmentWork = vi.fn(() => of(work));
    listDispatchReadiness = vi.fn(() => of(readiness));
    getSalesOrder = vi.fn(() => of({ body: order, etag: '"4"' }));
    getFulfillment = vi.fn(() =>
      of({ body: { id: "fulfillment-1", status: "ALLOCATED" }, etag: '"1"' }),
    );
    getPhysicalAllocation = vi.fn(() =>
      of({
        body: {
          allocationId: "allocation-1",
          status: "ALLOCATED",
          version: 1,
          asOf: "2026-10-09T10:00:00Z",
          lines: [],
        },
        etag: '"1"',
      }),
    );
    startFulfillment = vi.fn(() =>
      of({
        body: {
          id: "fulfillment-2",
          salesOrderId: "order-1",
          status: "ALLOCATED",
          version: 1,
        },
      }),
    );
    sessionState = signal<PlatformSessionState>({
      status: "authenticated",
      session: {
        membership: { permissions: ["fulfillment.manage", "sales.order.read"] },
      },
    });
    activeEpoch = lease.epoch;
    await TestBed.configureTestingModule({
      imports: [PlatformFulfillmentDeliveryComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: "sign-in", component: SignInRouteStubComponent },
        ]),
        {
          provide: NexaFulfillmentReadinessApi,
          useValue: {
            listOrderFulfillmentCandidates,
            listFulfillmentWork,
            listDispatchReadiness,
            getSalesOrder,
            getFulfillment,
            getPhysicalAllocation,
          },
        },
        { provide: NexaFulfillmentDeliveryApi, useValue: { startFulfillment } },
        {
          provide: NexaCommandRetryStore,
          useValue: {
            read: commandRetryRead,
            write: commandRetryWrite,
            remove: commandRetryRemove,
          },
        },
        {
          provide: PlatformSessionStore,
          useValue: {
            state: sessionState,
            captureSessionLease: vi.fn(() => lease),
            isSessionLeaseCurrent: vi.fn(
              (candidate: typeof lease) => candidate.epoch === activeEpoch,
            ),
            expireSessionIfCurrent: vi.fn(() => true),
            invalidateContextIfCurrent: vi.fn(() => true),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows confirmed-order candidates beside warehouse work and dispatch readiness", () => {
    const fixture = TestBed.createComponent(
      PlatformFulfillmentDeliveryComponent,
    );
    fixture.detectChanges();

    expect(listOrderFulfillmentCandidates).toHaveBeenCalledOnce();
    expect(listFulfillmentWork).toHaveBeenCalledOnce();
    expect(listDispatchReadiness).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain("SO-1001");
    expect(fixture.nativeElement.textContent).toContain("Warehouse work");
    expect(fixture.nativeElement.textContent).toContain("Dispatch readiness");
    expect(fixture.nativeElement.textContent).toContain("PICKING_INCOMPLETE");
  });

  it("reuses the same idempotency key after an uncertain start failure", () => {
    startFulfillment
      .mockReturnValueOnce(
        throwError(() => new NexaApiError("network", 0, null)),
      )
      .mockReturnValueOnce(
        of({
          body: {
            id: "fulfillment-2",
            salesOrderId: "order-1",
            status: "ALLOCATED",
            version: 1,
          },
        }),
      );
    const fixture = TestBed.createComponent(
      PlatformFulfillmentDeliveryComponent,
    );
    fixture.detectChanges();
    const orderButton = fixture.nativeElement.querySelector(
      ".fulfillment-list__row",
    ) as HTMLButtonElement;
    orderButton.click();
    fixture.detectChanges();

    const startButtons = fixture.nativeElement.querySelectorAll(
      "nexa-button",
    ) as NodeListOf<HTMLElement>;
    const startButton = Array.from(startButtons).find((button) =>
      button.textContent?.includes("Start fulfillment"),
    ) as HTMLElement;
    startButton.click();
    fixture.detectChanges();
    startButton.click();
    fixture.detectChanges();

    expect(startFulfillment).toHaveBeenCalledTimes(2);
    expect(startFulfillment).toHaveBeenNthCalledWith(
      1,
      "order-1",
      '"4"',
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(startFulfillment).toHaveBeenNthCalledWith(
      2,
      "order-1",
      '"4"',
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(commandRetryWrite).toHaveBeenCalledOnce();
    expect(commandRetryWrite).toHaveBeenCalledWith(
      "nexa.platform.fulfillment-start:user-1:tenant-1:workspace-1:membership-1:order-1:%224%22",
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(commandRetryRemove).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain(
      "Fulfillment fulfillment-2 started",
    );
    expect(listFulfillmentWork).toHaveBeenCalledTimes(2);
  });

  it("does not offer start when the API session omits fulfillment.manage", () => {
    sessionState.set({
      status: "authenticated",
      session: {
        membership: {
          permissions: ["fulfillment.read", "sales.order.read"],
        },
      },
    });
    const fixture = TestBed.createComponent(
      PlatformFulfillmentDeliveryComponent,
    );
    fixture.detectChanges();
    const orderButton = fixture.nativeElement.querySelector(
      ".fulfillment-list__row",
    ) as HTMLButtonElement;
    orderButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "does not report the fulfillment.manage permission",
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      "Start fulfillment",
    );
    expect(startFulfillment).not.toHaveBeenCalled();
  });

  it("starts confirmed candidates using their safe version when Sales detail is outside the read scope", () => {
    sessionState.set({
      status: "authenticated",
      session: {
        membership: { permissions: ["fulfillment.read", "fulfillment.manage"] },
      },
    });
    const fixture = TestBed.createComponent(
      PlatformFulfillmentDeliveryComponent,
    );
    fixture.detectChanges();
    const orderButton = fixture.nativeElement.querySelector(
      ".fulfillment-list__row",
    ) as HTMLButtonElement;
    orderButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("SO-1001");
    expect(fixture.nativeElement.textContent).toContain(
      "Fulfillment readiness",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "AWAITING_INVENTORY_RESERVATION",
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      "This order is no longer confirmed",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "full Sales Order detail is outside its read scope",
    );
    expect(getSalesOrder).not.toHaveBeenCalled();
    const startButtons = fixture.nativeElement.querySelectorAll(
      "nexa-button",
    ) as NodeListOf<HTMLElement>;
    const startButton = Array.from(startButtons).find((button) =>
      button.textContent?.includes("Start fulfillment"),
    ) as HTMLElement;
    startButton.click();
    fixture.detectChanges();

    expect(startFulfillment).toHaveBeenCalledOnce();
    expect(startFulfillment).toHaveBeenCalledWith(
      "order-1",
      '"4"',
      "123e4567-e89b-42d3-a456-426614174000",
    );
  });
});
