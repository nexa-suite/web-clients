import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../../http/nexa-http";
import {
  NEXA_BUYER_CATALOG_FAVORITES_API_PATHS,
  type BuyerCatalogFavoritePageResponse,
  type BuyerCatalogFavoriteResponse,
  type BuyerCatalogFavoritesQuery,
} from "../contracts/buyer-favorites.contracts";

@Injectable({ providedIn: "root" })
export class NexaBuyerCatalogFavoritesApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);

  list(query: BuyerCatalogFavoritesQuery = {}) {
    const page = query.page;
    const size = query.size;
    if (page !== undefined && (!Number.isSafeInteger(page) || page < 0)) {
      throw new Error("A non-negative Buyer favorites page is required.");
    }
    if (
      size !== undefined &&
      (!Number.isSafeInteger(size) || size < 1 || size > 100)
    ) {
      throw new Error("Buyer favorites page size must be between 1 and 100.");
    }

    let params = new HttpParams();
    if (page !== undefined) params = params.set("page", page);
    if (size !== undefined) params = params.set("size", size);
    return this.http.get<BuyerCatalogFavoritePageResponse>(
      this.collectionPath(),
      { params },
    );
  }

  add(sellableSkuId: string) {
    return this.http.put<BuyerCatalogFavoriteResponse>(
      this.favoritePath(sellableSkuId),
      null,
    );
  }

  remove(sellableSkuId: string) {
    return this.http.delete<void>(this.favoritePath(sellableSkuId));
  }

  private collectionPath(): string {
    return `${this.configuration.apiBaseUrl}${NEXA_BUYER_CATALOG_FAVORITES_API_PATHS.collection}`;
  }

  private favoritePath(sellableSkuId: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sellableSkuId,
      )
    ) {
      throw new Error("A valid Sellable SKU ID is required.");
    }
    return `${this.collectionPath()}/${encodeURIComponent(sellableSkuId)}`;
  }
}
