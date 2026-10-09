import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type { BuyerDeliveryEventResponse, BuyerDeliveryPageResponse, BuyerDeliveryResponse } from "../contracts/buyer-delivery.contracts";

@Injectable({ providedIn: "root" })
export class NexaBuyerDeliveriesApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);
  list(page = 0) {
    return this.http.get<BuyerDeliveryPageResponse>(`${this.configuration.apiBaseUrl}/dispatch-orders`, { params: { page, size: 25 } });
  }
  detail(id: string) {
    return this.http.get<BuyerDeliveryResponse>(this.path(id));
  }
  events(id: string) {
    return this.http.get<readonly BuyerDeliveryEventResponse[]>(`${this.path(id)}/events`);
  }
  private path(id: string): string {
    if (!id.trim()) throw new Error("Delivery ID is required.");
    return `${this.configuration.apiBaseUrl}/dispatch-orders/${encodeURIComponent(id)}`;
  }
}
