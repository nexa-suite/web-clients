import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type {
  CreatePurchaseRequestDraftRequest,
  PurchaseRequestDetail,
  PurchaseRequestDraft,
  PurchaseRequestDraftPage,
  PurchaseRequestDraftReview,
  PurchaseRequestDraftLineInput,
  PurchaseRequestPage,
  PurchaseRequestPageQuery,
  SalesOrder,
  SalesOrderPage,
  SalesOrderPageQuery,
  SetPurchaseRequestDraftPreferencesRequest,
} from "../contracts/sales-commitment.contracts";

/** Thin HTTP adapter for the API-owned Sales Commitment decisions. */
@Injectable({ providedIn: "root" })
export class NexaSalesCommitmentApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);
  private readonly baseUrl = this.configuration.apiBaseUrl;

  createDraft(request: CreatePurchaseRequestDraftRequest): Observable<HttpResponse<PurchaseRequestDraft>> {
    return this.http.post<PurchaseRequestDraft>(
      `${this.baseUrl}/buyer/purchase-request-drafts`,
      request,
      { observe: "response" },
    );
  }

  listDrafts(page = 0, size = 20): Observable<PurchaseRequestDraftPage> {
    return this.http.get<PurchaseRequestDraftPage>(
      `${this.baseUrl}/buyer/purchase-request-drafts`,
      { params: { page, size } },
    );
  }

  getDraft(draftId: string): Observable<HttpResponse<PurchaseRequestDraft>> {
    return this.http.get<PurchaseRequestDraft>(this.draftPath(draftId), { observe: "response" });
  }

  replaceDraftLines(
    draftId: string,
    version: number,
    lines: readonly PurchaseRequestDraftLineInput[],
  ): Observable<HttpResponse<PurchaseRequestDraft>> {
    return this.http.put<PurchaseRequestDraft>(
      `${this.draftPath(draftId)}/lines`,
      { lines },
      this.versionOptions(version),
    );
  }

  setDraftDestination(
    draftId: string,
    version: number,
    addressId: string,
  ): Observable<HttpResponse<PurchaseRequestDraft>> {
    return this.http.put<PurchaseRequestDraft>(
      `${this.draftPath(draftId)}/destination`,
      { addressId },
      this.versionOptions(version),
    );
  }

  previewDraftRoute(
    draftId: string,
    version: number,
    provider?: string,
  ): Observable<HttpResponse<PurchaseRequestDraft>> {
    return this.http.post<PurchaseRequestDraft>(
      `${this.draftPath(draftId)}/route-previews`,
      provider ? { provider } : {},
      this.versionOptions(version),
    );
  }

  setDraftPreferences(
    draftId: string,
    version: number,
    request: SetPurchaseRequestDraftPreferencesRequest,
  ): Observable<HttpResponse<PurchaseRequestDraft>> {
    return this.http.put<PurchaseRequestDraft>(
      `${this.draftPath(draftId)}/preferences`,
      request,
      this.versionOptions(version),
    );
  }

  getDraftReview(draftId: string): Observable<PurchaseRequestDraftReview> {
    return this.http.get<PurchaseRequestDraftReview>(`${this.draftPath(draftId)}/review`);
  }

  submitDraft(
    draftId: string,
    version: number,
    idempotencyKey: string,
  ): Observable<HttpResponse<PurchaseRequestDraft>> {
    return this.http.post<PurchaseRequestDraft>(
      `${this.draftPath(draftId)}/submissions`,
      null,
      this.commandOptions(version, idempotencyKey),
    );
  }

  listPurchaseRequests(query: PurchaseRequestPageQuery = {}): Observable<PurchaseRequestPage> {
    return this.http.get<PurchaseRequestPage>(`${this.baseUrl}/purchase-requests`, {
      params: this.pageParams(query),
    });
  }

  getPurchaseRequest(requestId: string): Observable<HttpResponse<PurchaseRequestDetail>> {
    return this.http.get<PurchaseRequestDetail>(this.purchaseRequestPath(requestId), {
      observe: "response",
    });
  }

  convertPurchaseRequest(
    requestId: string,
    version: number,
    idempotencyKey: string,
    note?: string,
  ): Observable<HttpResponse<SalesOrder>> {
    return this.http.post<SalesOrder>(
      `${this.purchaseRequestPath(requestId)}/order-conversions`,
      note?.trim() ? { note: note.trim() } : null,
      this.commandOptions(version, idempotencyKey),
    );
  }

  rejectPurchaseRequest(
    requestId: string,
    version: number,
    idempotencyKey: string,
    reviewNote: string,
  ): Observable<HttpResponse<PurchaseRequestDetail>> {
    return this.http.post<PurchaseRequestDetail>(
      `${this.purchaseRequestPath(requestId)}/rejections`,
      { reviewNote },
      this.commandOptions(version, idempotencyKey),
    );
  }

  listSalesOrders(query: SalesOrderPageQuery = {}): Observable<SalesOrderPage> {
    return this.http.get<SalesOrderPage>(`${this.baseUrl}/sales-orders`, {
      params: this.pageParams(query),
    });
  }

  getSalesOrder(orderId: string): Observable<HttpResponse<SalesOrder>> {
    return this.http.get<SalesOrder>(
      `${this.baseUrl}/sales-orders/${encodeURIComponent(orderId)}`,
      { observe: "response" },
    );
  }

  private draftPath(draftId: string): string {
    return `${this.baseUrl}/buyer/purchase-request-drafts/${encodeURIComponent(draftId)}`;
  }

  private purchaseRequestPath(requestId: string): string {
    return `${this.baseUrl}/purchase-requests/${encodeURIComponent(requestId)}`;
  }

  private pageParams(query: PurchaseRequestPageQuery | SalesOrderPageQuery): HttpParams {
    let params = new HttpParams();
    if (query.status) params = params.set("status", query.status);
    if (query.page !== undefined) params = params.set("page", query.page);
    if (query.size !== undefined) params = params.set("size", query.size);
    if (query.sort) params = params.set("sort", query.sort);
    return params;
  }

  private versionOptions(version: number) {
    return {
      headers: new HttpHeaders({ "If-Match": quoteVersion(version) }),
      observe: "response" as const,
    };
  }

  private commandOptions(version: number, idempotencyKey: string) {
    return {
      headers: new HttpHeaders({
        "If-Match": quoteVersion(version),
        "Idempotency-Key": requireIdempotencyKey(idempotencyKey),
      }),
      observe: "response" as const,
    };
  }
}

function quoteVersion(version: number): string {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("A current non-negative entity version is required.");
  }
  return `"${version}"`;
}

function requireIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 160) throw new Error("A valid idempotency key is required.");
  return key;
}
