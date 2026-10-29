import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { NexaAccessTokenStore } from "../../../http/access-token.store";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaSalesCommitmentApi } from "./sales-commitment-api";

describe("NexaSalesCommitmentApi", () => {
  let http: HttpTestingController;
  let api: NexaSalesCommitmentApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(NexaSalesCommitmentApi);
    TestBed.inject(NexaAccessTokenStore).set("current-context-token");
  });

  afterEach(() => http.verify());

  it("reads the API-owned Buyer delivery lead policy in the current session scope", () => {
    api.getBuyerDeliveryLeadPolicy().subscribe((policy) => {
      expect(policy).toEqual({
        minimumDeliveryLeadBusinessDays: 5,
        minimumAllowedDeliveryDate: "2026-11-05",
        timezone: "America/Lima",
      });
    });
    const request = http.expectOne("/api/v1/buyer/delivery-lead-policy");
    expect(request.request.method).toBe("GET");
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.headers.get("Authorization")).toBe(
      "Bearer current-context-token",
    );
    request.flush({
      minimumDeliveryLeadBusinessDays: 5,
      minimumAllowedDeliveryDate: "2026-11-05",
      timezone: "America/Lima",
    });
  });

  it("uses version preconditions and keeps the same submission key on a caller retry", () => {
    api.submitDraft("draft/one", 7, "buyer-submit-key").subscribe();
    const request = http.expectOne(
      "/api/v1/buyer/purchase-request-drafts/draft%2Fone/submissions",
    );
    expect(request.request.method).toBe("POST");
    expect(request.request.headers.get("If-Match")).toBe('"7"');
    expect(request.request.headers.get("Idempotency-Key")).toBe(
      "buyer-submit-key",
    );
    expect(request.request.body).toBeNull();
    request.flush({ id: "draft/one", version: 8, status: "SUBMITTED" }, {
      headers: { ETag: '"8"' },
    });

    api.submitDraft("draft/one", 7, "buyer-submit-key").subscribe();
    const retry = http.expectOne(
      "/api/v1/buyer/purchase-request-drafts/draft%2Fone/submissions",
    );
    expect(retry.request.headers.get("If-Match")).toBe('"7"');
    expect(retry.request.headers.get("Idempotency-Key")).toBe(
      "buyer-submit-key",
    );
    retry.flush({ id: "draft/one", version: 8, status: "SUBMITTED" }, {
      headers: { ETag: '"8"' },
    });
  });

  it("requires If-Match and an idempotency key for platform conversion and rejection", () => {
    api.convertPurchaseRequest("pr-1", 3, "convert-key", "Checked").subscribe();
    const convert = http.expectOne(
      "/api/v1/purchase-requests/pr-1/order-conversions",
    );
    expect(convert.request.headers.get("If-Match")).toBe('"3"');
    expect(convert.request.headers.get("Idempotency-Key")).toBe("convert-key");
    expect(convert.request.body).toEqual({ note: "Checked" });
    convert.flush({ id: "order-1", version: 0 }, { status: 201, statusText: "Created" });

    api.rejectPurchaseRequest("pr-2", 5, "reject-key", "Out of scope").subscribe();
    const reject = http.expectOne(
      "/api/v1/purchase-requests/pr-2/rejections",
    );
    expect(reject.request.headers.get("If-Match")).toBe('"5"');
    expect(reject.request.headers.get("Idempotency-Key")).toBe("reject-key");
    expect(reject.request.body).toEqual({ reviewNote: "Out of scope" });
    reject.flush({ id: "pr-2", version: 6 });
  });

  it("uses the canonical Buyer draft and read endpoints without client-selected account scope", () => {
    api.createDraft({
      clientAccountId: "server-validated-account",
      requestedDeliveryDate: "2026-10-20",
    }).subscribe();
    const create = http.expectOne("/api/v1/buyer/purchase-request-drafts");
    expect(create.request.method).toBe("POST");
    expect(create.request.body).toEqual({
      clientAccountId: "server-validated-account",
      requestedDeliveryDate: "2026-10-20",
    });
    expect(create.request.headers.get("Authorization")).toBe(
      "Bearer current-context-token",
    );
    create.flush({ id: "draft-1", version: 0 }, { status: 201, statusText: "Created", headers: { ETag: '"0"' } });

    api.listPurchaseRequests({ status: "SUBMITTED", page: 0, size: 25 }).subscribe();
    const requests = http.expectOne((candidate) =>
      candidate.url === "/api/v1/purchase-requests" &&
      candidate.params.get("status") === "SUBMITTED",
    );
    expect(requests.request.params.get("clientAccountId")).toBeNull();
    requests.flush({ items: [], page: 0, size: 25, total: 0 });
  });

  it("reads Buyer request activity and the current material change proposal", () => {
    api.listPurchaseRequestEvents("request/one").subscribe();
    const events = http.expectOne(
      "/api/v1/purchase-requests/request%2Fone/events",
    );
    expect(events.request.method).toBe("GET");
    events.flush([]);

    api.getCurrentMaterialChange("request/one").subscribe();
    const proposal = http.expectOne(
      "/api/v1/purchase-requests/request%2Fone/material-changes/current",
    );
    expect(proposal.request.method).toBe("GET");
    proposal.flush({
      id: "proposal-1",
      purchaseRequestId: "request/one",
      status: "PROPOSED",
      requestVersion: 4,
    });
  });

  it("sends Buyer material-change decisions and withdrawal with ETag and idempotency", () => {
    const request = { id: "request-1", version: 5, status: "CHANGES_PROPOSED" };

    api.acceptPurchaseRequestMaterialChange("request-1", "proposal/1", '"4"', "accept-key").subscribe();
    const accept = http.expectOne(
      "/api/v1/purchase-requests/request-1/material-changes/proposal%2F1/acceptances",
    );
    expect(accept.request.method).toBe("POST");
    expect(accept.request.body).toBeNull();
    expect(accept.request.headers.get("If-Match")).toBe('"4"');
    expect(accept.request.headers.get("Idempotency-Key")).toBe("accept-key");
    accept.flush(request, { headers: { ETag: '"5"' } });

    api.rejectPurchaseRequestMaterialChange("request-1", "proposal-1", '"5"', "reject-key").subscribe();
    const reject = http.expectOne(
      "/api/v1/purchase-requests/request-1/material-changes/proposal-1/rejections",
    );
    expect(reject.request.method).toBe("POST");
    expect(reject.request.body).toBeNull();
    expect(reject.request.headers.get("If-Match")).toBe('"5"');
    expect(reject.request.headers.get("Idempotency-Key")).toBe("reject-key");
    reject.flush(request, { headers: { ETag: '"6"' } });

    api.withdrawPurchaseRequest("request-1", '"6"', "withdraw-key").subscribe();
    const withdraw = http.expectOne("/api/v1/purchase-requests/request-1/withdrawals");
    expect(withdraw.request.method).toBe("POST");
    expect(withdraw.request.body).toBeNull();
    expect(withdraw.request.headers.get("If-Match")).toBe('"6"');
    expect(withdraw.request.headers.get("Idempotency-Key")).toBe("withdraw-key");
    withdraw.flush({ ...request, status: "WITHDRAWN", version: 7 }, { headers: { ETag: '"7"' } });
  });

  it("rejects invalid version and key values before making a request", () => {
    let versionFailure: unknown;
    let keyFailure: unknown;
    try { api.submitDraft("draft-1", -1, "key"); } catch (error: unknown) { versionFailure = error; }
    try { api.submitDraft("draft-1", 0, " "); } catch (error: unknown) { keyFailure = error; }
    expect(versionFailure).toBeInstanceOf(Error);
    expect(keyFailure).toBeInstanceOf(Error);
    http.expectNone(() => true);
  });
});
