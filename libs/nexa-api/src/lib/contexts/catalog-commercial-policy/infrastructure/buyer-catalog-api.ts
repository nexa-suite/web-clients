import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, throwError } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import {
  BuyerCatalogItemDetailResponse,
  BuyerCatalogPageResponse,
  BuyerCatalogQuery,
} from "../contracts/buyer-catalog.contracts";

@Injectable({ providedIn: "root" })
export class NexaBuyerCatalogApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);

  listCatalog(
    query: BuyerCatalogQuery = {},
  ): Observable<BuyerCatalogPageResponse> {
    let params = new HttpParams();
    for (const key of [
      "q",
      "brand",
      "category",
      "coldChain",
      "page",
      "size",
      "sort",
      "direction",
    ] as const) {
      const value = query[key];
      if (value !== undefined) params = params.set(key, String(value));
    }
    return this.http.get<BuyerCatalogPageResponse>(
      `${this.configuration.apiBaseUrl}/catalog-items`,
      { params },
    );
  }

  getCatalogItem(
    catalogItemId: string,
  ): Observable<BuyerCatalogItemDetailResponse> {
    if (!catalogItemId.trim())
      return throwError(() => new Error("A catalog item ID is required."));
    return this.http.get<BuyerCatalogItemDetailResponse>(
      `${this.configuration.apiBaseUrl}/catalog-items/${encodeURIComponent(catalogItemId)}`,
    );
  }
}
