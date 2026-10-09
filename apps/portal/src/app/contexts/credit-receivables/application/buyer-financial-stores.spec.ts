import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  NexaReceivablesApi,
  NexaPaymentHistoryApi,
  NexaApiError,
} from "@nexa/api";
import { Subject } from "rxjs";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import { BuyerReceivablesStore } from "./buyer-receivables.store";
import { BuyerCreditStore } from "./buyer-credit.store";
import { BuyerPaymentHistoryStore } from "../../payments/application/public-api";

for (const Store of [
  BuyerReceivablesStore,
  BuyerCreditStore,
  BuyerPaymentHistoryStore,
]) {
  describe(Store.name + " session fencing", () => {
    let active = signal(true);
    let response: Subject<any>;
    let store: any;
    const lease = {};
    let expired: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      active = signal(true);
      response = new Subject();
      expired = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: NexaReceivablesApi,
            useValue: { list: () => response, currentCredit: () => response },
          },
          {
            provide: NexaPaymentHistoryApi,
            useValue: { forReceivable: () => response },
          },
          {
            provide: PortalSessionStore,
            useValue: {
              captureSessionLease: () => (active() ? lease : null),
              isSessionLeaseCurrent: () => active(),
              expireSessionIfCurrent: expired,
              invalidateContextIfCurrent: vi.fn(),
            },
          },
        ],
      });
      store = TestBed.inject(Store as any);
    });
    function load() {
      return Store === BuyerPaymentHistoryStore
        ? store.load("receivable")
        : store.load();
    }
    it("discards a late response after session scope changes", async () => {
      const pending = load();
      active.set(false);
      response.next({ items: [{ id: "old-account" }] });
      await pending;
      expect(store.state()).toBeNull();
    });
    it("masks already-loaded facts when the session changes", async () => {
      const pending = load();
      response.next({ items: [{ id: "account" }] });
      await pending;
      expect(store.state().data.items).toHaveLength(1);
      active.set(false);

      expect(store.state()).toBeNull();
    });
    it("does not expire a replacement session on a stale unauthorized result", async () => {
      const pending = load();
      active.set(false);
      response.error(new NexaApiError("unauthenticated", 401, null));
      await pending;
      expect(expired).not.toHaveBeenCalled();
      expect(store.state()).toBeNull();
    });
    it("keeps ordinary forbidden responses as feature errors", async () => {
      const pending = load();
      response.error(new NexaApiError("forbidden", 403, null));
      await pending;
      expect(store.state().error).toBeTruthy();
      expect(expired).not.toHaveBeenCalled();
    });
  });
}
