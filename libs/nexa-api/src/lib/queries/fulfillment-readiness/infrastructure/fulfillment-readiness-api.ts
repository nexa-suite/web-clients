import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, map } from "rxjs";
import {
  DispatchReadinessPageResponse,
  DispatchReadinessResponse,
  FulfillmentCandidatePageResponse,
  FulfillmentWorkPageResponse,
  NEXA_FULFILLMENT_READINESS_API_PATHS,
  NexaResourceResponse,
  PhysicalAllocationResponse,
  SalesOrderResponse,
} from "../contracts/fulfillment-readiness.contracts";
import type { FulfillmentResponse } from "../../../contexts/fulfillment-delivery/public-api";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";

/** Current, server-scoped read transport for order and fulfillment readiness. */
@Injectable({ providedIn: "root" })
export class NexaFulfillmentReadinessApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);

  listOrderFulfillmentCandidates(
    page = 0,
    size = 25,
  ): Observable<FulfillmentCandidatePageResponse> {
    return this.http.get<FulfillmentCandidatePageResponse>(
      this.url(NEXA_FULFILLMENT_READINESS_API_PATHS.orderFulfillmentCandidates),
      { params: { page, size } },
    );
  }

  getSalesOrder(
    id: string,
  ): Observable<NexaResourceResponse<SalesOrderResponse>> {
    return this.http
      .get<SalesOrderResponse>(
        this.url(
          `${NEXA_FULFILLMENT_READINESS_API_PATHS.salesOrders}/${encodeURIComponent(id)}`,
        ),
        { observe: "response" },
      )
      .pipe(
        map((response) => {
          if (!response.body)
            throw new Error("Sales Order response body is missing.");
          return { body: response.body, etag: response.headers.get("ETag") };
        }),
      );
  }

  listFulfillmentWork(
    page = 0,
    size = 25,
  ): Observable<FulfillmentWorkPageResponse> {
    return this.http.get<FulfillmentWorkPageResponse>(
      this.url(NEXA_FULFILLMENT_READINESS_API_PATHS.fulfillments),
      { params: { page, size } },
    );
  }

  getFulfillment(
    id: string,
  ): Observable<NexaResourceResponse<FulfillmentResponse>> {
    return this.getResource<FulfillmentResponse>(
      `${NEXA_FULFILLMENT_READINESS_API_PATHS.fulfillments}/${encodeURIComponent(id)}`,
    );
  }

  getPhysicalAllocation(
    id: string,
  ): Observable<NexaResourceResponse<PhysicalAllocationResponse>> {
    return this.getResource<PhysicalAllocationResponse>(
      `${NEXA_FULFILLMENT_READINESS_API_PATHS.fulfillments}/${encodeURIComponent(id)}/physical-allocation`,
    );
  }

  listDispatchReadiness(
    page = 0,
    size = 25,
  ): Observable<DispatchReadinessPageResponse> {
    return this.http.get<DispatchReadinessPageResponse>(
      this.url(NEXA_FULFILLMENT_READINESS_API_PATHS.dispatchReadiness),
      { params: { page, size } },
    );
  }

  getDispatchReadiness(id: string): Observable<DispatchReadinessResponse> {
    return this.http.get<DispatchReadinessResponse>(
      this.url(
        `${NEXA_FULFILLMENT_READINESS_API_PATHS.dispatchReadiness}/${encodeURIComponent(id)}`,
      ),
    );
  }

  private getResource<T>(path: string): Observable<NexaResourceResponse<T>> {
    return this.http.get<T>(this.url(path), { observe: "response" }).pipe(
      map((response) => {
        if (!response.body)
          throw new Error("Fulfillment response body is missing.");
        return { body: response.body, etag: response.headers.get("ETag") };
      }),
    );
  }

  private url(path: string): string {
    return `${this.configuration.apiBaseUrl}${path}`;
  }
}
