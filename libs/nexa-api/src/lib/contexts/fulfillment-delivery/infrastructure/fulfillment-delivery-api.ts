import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, map } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import {
  NEXA_FULFILLMENT_DELIVERY_API_PATHS,
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
}
