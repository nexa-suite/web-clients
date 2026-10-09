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
