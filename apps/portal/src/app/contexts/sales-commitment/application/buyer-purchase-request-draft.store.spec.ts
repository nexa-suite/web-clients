import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { NexaBuyerRelationshipsApi, NexaCommandRetryStore, NexaSalesCommitmentApi } from "@nexa/api";
import type { PurchaseRequestDraft, PurchaseRequestDraftReview } from "@nexa/api";
import type { PortalSessionLease } from "../../tenant-access-governance/application/public-api";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerPurchaseRequestDraftStore } from "./buyer-purchase-request-draft.store";

describe("BuyerPurchaseRequestDraftStore", () => {
  const lease: PortalSessionLease = {
    epoch: 1,
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "buyer-membership-1",
      surface: "PORTAL",
    },
  };

  const draft: PurchaseRequestDraft = {
    id: "draft-1",
    clientAccountId: "buyer-account-1",
    buyerMembershipId: "buyer-membership-1",
    status: "READY_TO_SUBMIT",
    version: 4,
    requestedDeliveryDate: "2026-10-20",
    paymentPreference: "BANK_TRANSFER",
    creditResult: null,
    routeProvider: "NEXA",
    lines: [],
    destination: { addressId: "address-1", snapshot: "{}", schemaVersion: "1" },
    route: { provider: "NEXA", estimated: true, snapshot: "{}", schemaVersion: "1", calculatedAt: "2026-10-09T00:00:00Z" },
    warehouseSelection: null,
    createdAt: "2026-10-09T00:00:00Z",
    updatedAt: "2026-10-09T00:00:00Z",
    submittedAt: null,
  };

  const submittedDraft: PurchaseRequestDraft = {
    ...draft,
    status: "SUBMITTED",
    version: 5,
    submittedAt: "2026-10-09T00:01:00Z",
  };

  const review: PurchaseRequestDraftReview = {
    draft,
    productsComplete: true,
    destinationComplete: true,
    routeValidated: true,
    commercialReviewComplete: true,
    readyToSubmit: true,
    missing: [],
  };

  let api: {
    getBuyerDeliveryLeadPolicy: ReturnType<typeof vi.fn>;
    createDraft: ReturnType<typeof vi.fn>;
    getDraft: ReturnType<typeof vi.fn>;
    getDraftReview: ReturnType<typeof vi.fn>;
    replaceDraftLines: ReturnType<typeof vi.fn>;
    setDraftPreferences: ReturnType<typeof vi.fn>;
    submitDraft: ReturnType<typeof vi.fn>;
  };
  let sessions: {
    captureSessionLease: ReturnType<typeof vi.fn>;
    isSessionLeaseCurrent: ReturnType<typeof vi.fn>;
  };
  let retryValues: Map<string, string>;
  let retryCommands: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let store: BuyerPurchaseRequestDraftStore;

  beforeEach(() => {
    retryValues = new Map();
    retryCommands = {
      read: vi.fn((key: string) => retryValues.get(key) ?? null),
      write: vi.fn((key: string, value: string) => retryValues.set(key, value)),
      remove: vi.fn((key: string) => { retryValues.delete(key); }),
    };
    api = {
      getBuyerDeliveryLeadPolicy: vi.fn().mockReturnValue(of({
        minimumDeliveryLeadBusinessDays: 5,
        minimumAllowedDeliveryDate: "2026-10-20",
        timezone: "America/Lima",
      })),
      createDraft: vi.fn(),
      getDraft: vi.fn().mockReturnValue(of(apiResponse(draft, '"4"'))),
      getDraftReview: vi.fn().mockReturnValue(of(review)),
      replaceDraftLines: vi.fn(),
      setDraftPreferences: vi.fn(),
      submitDraft: vi.fn()
        .mockReturnValueOnce(throwError(() => new Error("response timed out")))
        .mockReturnValueOnce(of(apiResponse(submittedDraft, '"5"'))),
    };
    sessions = {
      captureSessionLease: vi.fn(() => lease),
      isSessionLeaseCurrent: vi.fn(() => true),
    };
    TestBed.configureTestingModule({
      providers: [
        BuyerPurchaseRequestDraftStore,
        { provide: NexaSalesCommitmentApi, useValue: api },
        { provide: NexaCommandRetryStore, useValue: retryCommands },
        { provide: NexaBuyerRelationshipsApi, useValue: { listAccountAddresses: vi.fn() } },
        { provide: PortalSessionStore, useValue: sessions },
      ],
    });
    store = TestBed.inject(BuyerPurchaseRequestDraftStore);
  });

  it("loads API-owned policy and allows only dates at or after its returned minimum", async () => {
    api.getBuyerDeliveryLeadPolicy.mockReturnValue(of({
      minimumDeliveryLeadBusinessDays: 4,
      minimumAllowedDeliveryDate: "2026-10-25",
      timezone: "America/Lima",
    }));

    await store.loadDeliveryLeadPolicy();

    expect(api.getBuyerDeliveryLeadPolicy).toHaveBeenCalledOnce();
    expect(store.deliveryLeadPolicy()).toEqual({
      status: "ready",
      policy: {
        minimumDeliveryLeadBusinessDays: 4,
        minimumAllowedDeliveryDate: "2026-10-25",
        timezone: "America/Lima",
      },
      errorMessage: null,
    });
    expect(store.allowsDeliveryDate("2026-10-25")).toBe(true);
    expect(store.allowsDeliveryDate("2026-10-24")).toBe(false);
    expect(store.allowsDeliveryDate("2026-02-30")).toBe(false);
  });

  it("fails closed on malformed policy and blocks draft creation, preference updates, and submission", async () => {
    api.getBuyerDeliveryLeadPolicy.mockReturnValue(of({
      minimumDeliveryLeadBusinessDays: 5,
      minimumAllowedDeliveryDate: "not-a-date",
      timezone: "America/Lima",
    }));

    await store.loadDeliveryLeadPolicy();
    expect(store.deliveryLeadPolicy().status).toBe("error");
    expect(store.allowsDeliveryDate("2026-10-20")).toBe(false);
    expect(await store.createDraft("buyer-account-1", "2026-10-20")).toBeNull();
    await store.loadDraft(draft.id);
    await store.setPreferences({
      paymentPreference: "BANK_TRANSFER",
      requestedDeliveryDate: "2026-10-20",
    });
    await store.submit();

    expect(api.createDraft).not.toHaveBeenCalled();
    expect(api.setDraftPreferences).not.toHaveBeenCalled();
    expect(api.submitDraft).not.toHaveBeenCalled();
  });

  it("preserves the draft and reuses the same idempotency key after an uncertain submit response", async () => {
    await store.loadDeliveryLeadPolicy();
    await store.loadDraft(draft.id);
    expect(store.state().draft).toEqual(draft);
    expect(store.state().review?.readyToSubmit).toBe(true);

    await store.submit();
    const firstKey = api.submitDraft.mock.calls[0]?.[2] as string;
    expect(firstKey).toBeTruthy();
    expect(store.state().status).toBe("error");
    expect(store.state().submissionKeyPending).toBe(true);
    expect(store.state().draft).toEqual(draft);
    expect(retryValues.size).toBe(1);

    await store.submit();
    expect(api.submitDraft).toHaveBeenNthCalledWith(1, draft.id, draft.version, firstKey);
    expect(api.submitDraft).toHaveBeenNthCalledWith(2, draft.id, draft.version, firstKey);
    expect(store.state().status).toBe("submitted");
    expect(store.state().draft).toEqual(submittedDraft);
    expect(store.state().submissionKeyPending).toBe(false);
    expect(retryValues.size).toBe(0);
  });

  it("blocks editing while the submission result is uncertain", async () => {
    await store.loadDeliveryLeadPolicy();
    await store.loadDraft(draft.id);
    await store.submit();
    await store.replaceLines([{ skuId: "sku-1", quantity: 2 }]);

    expect(api.submitDraft).toHaveBeenCalledTimes(1);
    expect(api.replaceDraftLines).not.toHaveBeenCalled();
    expect(store.state().draft).toEqual(draft);
    expect(store.state().submissionKeyPending).toBe(true);
  });
});

function apiResponse<T>(body: T, etag: string) {
  return { body, headers: { get: (name: string) => name.toLowerCase() === "etag" ? etag : null } };
}
