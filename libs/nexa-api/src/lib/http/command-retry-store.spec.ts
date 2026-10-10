import { DOCUMENT } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { NexaCommandRetryStore } from "./command-retry-store";

interface FakeStorage {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
}

describe("NexaCommandRetryStore", () => {
  const buyerKey =
    "nexa:buyer:purchase-request-submit:tenant:workspace:membership:draft";
  const reviewKey =
    "nexa:platform:purchase-request-command:tenant:workspace:membership:request";
  const fulfillmentKey =
    "nexa.platform.fulfillment-start:user:tenant:workspace:membership:order:%224%22";
  const documentKey =
    "nexa:platform:order-summary-generation:user:tenant:workspace:membership:order";
  let values: Map<string, string>;
  let storage: FakeStorage;
  let store: NexaCommandRetryStore;

  beforeEach(() => {
    values = new Map();
    storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: { defaultView: { sessionStorage: storage } },
        },
      ],
    });
    store = TestBed.inject(NexaCommandRetryStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it("persists supported retry values in session storage and reads them back", () => {
    const buyerCommandKey =
      "buyer-pr-submit-123e4567-e89b-42d3-a456-426614174000";
    const fulfillmentCommandKey = "123e4567-e89b-42d3-a456-426614174000";
    const reviewCommand = JSON.stringify({
      action: "convert",
      version: 3,
      note: "Approved",
      key: "sales-pr-convert-123e4567-e89b-42d3-a456-426614174000",
    });

    store.write(buyerKey, buyerCommandKey);
    store.write(fulfillmentKey, fulfillmentCommandKey);
    store.write(reviewKey, reviewCommand);

    expect(store.read(buyerKey)).toBe(buyerCommandKey);
    expect(store.read(fulfillmentKey)).toBe(fulfillmentCommandKey);
    expect(store.read(reviewKey)).toBe(reviewCommand);
    expect(storage.setItem).toHaveBeenCalledTimes(3);
  });

  it("keeps a pending command available after the service is recreated", () => {
    const key = "123e4567-e89b-42d3-a456-426614174000";
    store.write(documentKey, key);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: { defaultView: { sessionStorage: storage } },
        },
      ],
    });
    store = TestBed.inject(NexaCommandRetryStore);

    expect(store.read(documentKey)).toBe(key);
    expect(
      store.read(documentKey.replace(":tenant:", ":another-tenant:")),
    ).toBeNull();
  });

  it("isolates hashed payment and fulfillment command intents and rejects raw payloads", () => {
    const hash = "a".repeat(64);
    const payment = `nexa:buyer:bank-transfer:user:tenant:workspace:member:receivable:${hash}`;
    const fulfillment = `nexa:platform:fulfillment-command:user:tenant:workspace:member:fulfillment:packing:${hash}`;
    const id = "123e4567-e89b-42d3-a456-426614174000";
    store.write(payment, id);
    store.write(fulfillment, id);
    expect(store.read(payment)).toBe(id);
    expect(store.read(payment.replace(":tenant:", ":other:"))).toBeNull();
    expect(store.read(fulfillment.replace(hash, "b".repeat(64)))).toBeNull();
    expect(() => store.write(payment, '{"reference":"secret"}')).toThrow();
    expect(() => store.write(payment.replace(hash, "raw-reference"), id)).toThrow();
  });

  it("accepts only hashed credit-configuration retry keys with UUID values", () => {
    const hash = "c".repeat(64);
    const key = `nexa:platform:credit-configuration:user:tenant:workspace:member:account:PEN:${hash}`;
    const idempotencyKey = "123e4567-e89b-42d3-a456-426614174000";
    store.write(key, idempotencyKey);

    expect(store.read(key)).toBe(idempotencyKey);
    expect(() => store.read(key.replace(hash, "credit-limit-500"))).toThrow();
    expect(() => store.write(key, '{"creditLimit":500}')).toThrow();
    expect(() => store.write(key.replace(hash, "a".repeat(63)), idempotencyKey)).toThrow();
  });

  it("keeps an idempotency key in memory when session storage is blocked", () => {
    storage.setItem.mockImplementation(() => {
      throw new DOMException("Storage is unavailable", "SecurityError");
    });
    storage.getItem.mockImplementation(() => {
      throw new DOMException("Storage is unavailable", "SecurityError");
    });

    const key = "123e4567-e89b-42d3-a456-426614174000";
    store.write(fulfillmentKey, key);

    expect(store.read(fulfillmentKey)).toBe(key);
  });

  it("uses an in-memory fallback when the document has no browser window", () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: null } }],
    });
    store = TestBed.inject(NexaCommandRetryStore);
    const key = "123e4567-e89b-42d3-a456-426614174000";

    store.write(fulfillmentKey, key);

    expect(store.read(fulfillmentKey)).toBe(key);
  });

  it("removes retry state from both session storage and memory", () => {
    const key = "123e4567-e89b-42d3-a456-426614174000";
    store.write(fulfillmentKey, key);

    store.remove(fulfillmentKey);

    expect(store.read(fulfillmentKey)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(fulfillmentKey);
  });

  it("does not resurrect a removed value when session storage refuses cleanup", () => {
    const key = "123e4567-e89b-42d3-a456-426614174000";
    store.write(fulfillmentKey, key);
    storage.removeItem.mockImplementation(() => {
      throw new DOMException("Storage is unavailable", "SecurityError");
    });

    store.remove(fulfillmentKey);

    expect(store.read(fulfillmentKey)).toBeNull();
  });

  it("rejects unscoped storage keys and values with added credential fields", () => {
    expect(() => store.write("nexa:unrelated:key", "value")).toThrow(
      "Only scoped Nexa command retry keys are supported.",
    );
    for (const key of [
      "nexa:buyer:purchase-request-submit:",
      "nexa:buyer:purchase-request-submit:x",
      "nexa:buyer:purchase-request-submit:tenant:workspace::draft",
      "nexa:platform:purchase-request-command:tenant:workspace:request",
      "nexa.platform.fulfillment-start:user:tenant:workspace:membership:order",
      "nexa:platform:order-summary-generation:tenant:workspace:membership:order",
      "nexa:platform:order-summary-generation:user:tenant:workspace::order",
    ]) {
      expect(() => store.read(key)).toThrow(
        "Only scoped Nexa command retry keys are supported.",
      );
    }
    expect(() =>
      store.write(
        reviewKey,
        JSON.stringify({
          action: "reject",
          version: 3,
          note: "Rejected",
          key: "sales-pr-reject-123e4567-e89b-42d3-a456-426614174000",
          accessToken: "secret",
        }),
      ),
    ).toThrow("The retry value is not an allowed Nexa command payload.");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rejects credential payloads for order summary retries", () => {
    expect(() =>
      store.write(documentKey, JSON.stringify({ accessToken: "secret" })),
    ).toThrow("The retry value is not an allowed Nexa command payload.");
    values.set(documentKey, "not-a-uuid");
    expect(store.read(documentKey)).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("ignores and clears malformed persisted retry data", () => {
    values.set(reviewKey, JSON.stringify({ accessToken: "secret" }));

    expect(store.read(reviewKey)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(reviewKey);
  });
});
