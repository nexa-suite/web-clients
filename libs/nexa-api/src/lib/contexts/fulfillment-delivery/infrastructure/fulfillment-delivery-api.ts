import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, map } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import {
  AssignDriverRequest,
  ConfirmPickingRequest,
  DispatchAssigneeResponse,
  DispatchOutgoingGoodsCheckSummaryResponse,
  DispatchRequest,
  DispatchWindowPlanRequest,
  DispatchWindowPlanResponse,
  DriverAssignmentResponse,
  FulfillmentResourceResponse,
  NEXA_FULFILLMENT_DELIVERY_API_PATHS,
  OutgoingGoodsCheckResponse,
  RecordOutgoingGoodsCheckRequest,
  ResolveShortageRequest,
  StartFulfillmentResponse,
} from "../contracts/fulfillment-delivery.contracts";

/** BC-06 fulfillment command transport. The API remains authoritative for grants and state. */
@Injectable({ providedIn: "root" })
export class NexaFulfillmentDeliveryApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);

  startFulfillment(
    salesOrderId: string,
    salesOrderEtag: string,
    idempotencyKey: string,
  ): Observable<StartFulfillmentResponse> {
    if (!salesOrderEtag.trim()) {
      throw new Error(
        "The current Sales Order ETag is required to start fulfillment.",
      );
    }
    if (!idempotencyKey.trim() || idempotencyKey.length > 160) {
      throw new Error("A stable fulfillment Idempotency-Key is required.");
    }

    const headers = new HttpHeaders({
      "If-Match": salesOrderEtag,
      "Idempotency-Key": idempotencyKey,
    });

    return this.http
      .post<
        StartFulfillmentResponse["body"]
      >(`${this.configuration.apiBaseUrl}${NEXA_FULFILLMENT_DELIVERY_API_PATHS.salesOrders}/${encodeURIComponent(salesOrderId)}/fulfillments`, null, { headers, observe: "response" })
      .pipe(
        map((response) => {
          if (!response.body)
            throw new Error("Fulfillment command response body is missing.");
          return { body: response.body, etag: response.headers.get("ETag") };
        }),
      );
  }

  startPicking(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
  ): Observable<FulfillmentResourceResponse> {
    return this.fulfillmentCommand(fulfillmentId, "picking-starts", etag, idempotencyKey, null);
  }

  confirmPicking(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
    request: ConfirmPickingRequest,
  ): Observable<FulfillmentResourceResponse> {
    return this.fulfillmentCommand(fulfillmentId, "picking-confirmations", etag, idempotencyKey, request);
  }

  resolveShortage(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
    request: ResolveShortageRequest,
  ): Observable<FulfillmentResourceResponse> {
    return this.fulfillmentCommand(fulfillmentId, "shortage-resolutions", etag, idempotencyKey, request);
  }

  pack(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
  ): Observable<FulfillmentResourceResponse> {
    return this.fulfillmentCommand(fulfillmentId, "packing", etag, idempotencyKey, null);
  }

  stage(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
  ): Observable<FulfillmentResourceResponse> {
    return this.fulfillmentCommand(fulfillmentId, "staging", etag, idempotencyKey, null);
  }

  readyForDispatch(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
  ): Observable<FulfillmentResourceResponse> {
    return this.fulfillmentCommand(fulfillmentId, "ready-for-dispatch", etag, idempotencyKey, null);
  }

  dispatch(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
    request: DispatchRequest,
  ): Observable<FulfillmentResourceResponse> {
    return this.fulfillmentCommand(fulfillmentId, "dispatches", etag, idempotencyKey, request);
  }

  getCurrentDriverAssignment(
    fulfillmentId: string,
  ): Observable<FulfillmentResourceResponseFor<DriverAssignmentResponse> | null> {
    return this.getOptionalResource<DriverAssignmentResponse>(
      `${this.fulfillmentsPath(fulfillmentId)}/driver-assignments`,
    );
  }

  listDispatchAssignees(): Observable<readonly DispatchAssigneeResponse[]> {
    return this.http.get<readonly DispatchAssigneeResponse[]>(
      this.url(NEXA_FULFILLMENT_DELIVERY_API_PATHS.dispatchAssignees),
    );
  }

  assignDriver(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
    request: AssignDriverRequest,
  ): Observable<FulfillmentResourceResponseFor<DriverAssignmentResponse>> {
    return this.resourceCommand(
      `${this.fulfillmentsPath(fulfillmentId)}/driver-assignments`,
      etag,
      idempotencyKey,
      request,
      "Driver assignment response body is missing.",
    );
  }

  getCurrentOutgoingGoodsCheck(
    fulfillmentId: string,
  ): Observable<FulfillmentResourceResponseFor<OutgoingGoodsCheckResponse> | null> {
    return this.getOptionalResource<OutgoingGoodsCheckResponse>(
      `${this.fulfillmentsPath(fulfillmentId)}/outgoing-checks/current`,
    );
  }

  getCurrentDispatchOutgoingGoodsCheckSummary(
    fulfillmentId: string,
  ): Observable<FulfillmentResourceResponseFor<DispatchOutgoingGoodsCheckSummaryResponse> | null> {
    return this.getOptionalResource<DispatchOutgoingGoodsCheckSummaryResponse>(
      `${this.fulfillmentsPath(fulfillmentId)}/outgoing-checks/current-summary`,
    );
  }

  recordOutgoingGoodsCheck(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
    request: RecordOutgoingGoodsCheckRequest,
  ): Observable<FulfillmentResourceResponseFor<OutgoingGoodsCheckResponse>> {
    return this.resourceCommand(
      `${this.fulfillmentsPath(fulfillmentId)}/outgoing-checks`,
      etag,
      idempotencyKey,
      request,
      "Outgoing-goods check response body is missing.",
    );
  }

  planDispatchWindow(
    fulfillmentId: string,
    etag: string,
    idempotencyKey: string,
    request: DispatchWindowPlanRequest,
  ): Observable<FulfillmentResourceResponseFor<DispatchWindowPlanResponse>> {
    return this.resourceCommand(
      `${this.fulfillmentsPath(fulfillmentId)}/dispatch-window-plans`,
      etag,
      idempotencyKey,
      request,
      "Dispatch-window plan response body is missing.",
    );
  }

  private fulfillmentCommand(
    fulfillmentId: string,
    command: string,
    etag: string,
    idempotencyKey: string,
    request: unknown,
  ): Observable<FulfillmentResourceResponse> {
    return this.resourceCommand<FulfillmentResourceResponse["body"]>(
      `${this.fulfillmentsPath(fulfillmentId)}/${command}`,
      etag,
      idempotencyKey,
      request,
      "Fulfillment command response body is missing.",
    );
  }

  private resourceCommand<T>(
    path: string,
    etag: string,
    idempotencyKey: string,
    request: unknown,
    missingBodyMessage: string,
  ): Observable<FulfillmentResourceResponseFor<T>> {
    if (!etag.trim()) {
      throw new Error("A current resource ETag is required for this fulfillment command.");
    }
    if (!idempotencyKey.trim() || idempotencyKey.length > 160) {
      throw new Error("A stable fulfillment Idempotency-Key is required.");
    }
    const headers = new HttpHeaders({
      "If-Match": etag,
      "Idempotency-Key": idempotencyKey,
    });
    return this.http
      .post<T>(this.url(path), request, { headers, observe: "response" })
      .pipe(
        map((response) => {
          if (!response.body) throw new Error(missingBodyMessage);
          return { body: response.body, etag: response.headers.get("ETag") };
        }),
      );
  }

  private getOptionalResource<T>(
    path: string,
  ): Observable<FulfillmentResourceResponseFor<T> | null> {
    return this.http
      .get<T>(this.url(path), { observe: "response" })
      .pipe(
        map((response) =>
          response.body
            ? { body: response.body, etag: response.headers.get("ETag") }
            : null,
        ),
      );
  }

  private fulfillmentsPath(fulfillmentId: string): string {
    return `${NEXA_FULFILLMENT_DELIVERY_API_PATHS.fulfillments}/${encodeURIComponent(fulfillmentId)}`;
  }

  private url(path: string): string {
    return `${this.configuration.apiBaseUrl}${path}`;
  }
}

interface FulfillmentResourceResponseFor<T> {
  readonly body: T;
  readonly etag: string | null;
}
