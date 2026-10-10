import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type { BuyerDeliveryEventResponse, BuyerDeliveryPageResponse, BuyerDeliveryResponse } from "../contracts/buyer-delivery.contracts";

@Injectable({ providedIn: "root" })
export class NexaBuyerDeliveriesApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);
  list(page = 0) {
    return this.http.get<BuyerDeliveryPageResponse>(`${this.configuration.apiBaseUrl}/buyer/deliveries`, { params: { page, size: 25 } });
  }
  detail(id: string) {
    return this.http.get<BuyerDeliveryResponse>(this.path(id));
  }
  events(id: string) {
    return this.http.get<readonly BuyerDeliveryEventResponse[]>(`${this.path(id)}/events`);
  }
  private path(id: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("A valid Delivery ID is required.");
    }
    return `${this.configuration.apiBaseUrl}/buyer/deliveries/${encodeURIComponent(id)}`;
  }
}
