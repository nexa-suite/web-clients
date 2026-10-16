import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";

export interface PlatformCatalogProduct {
  id: string;
  catalogItemId: string;
  productCode: string;
  slug: string;
  name: string;
  description: string;
  categoryName: string | null;
  brandName: string | null;
  storageTemperature: string | null;
  status: string;
  presentation: string | null;
  unitOfMeasure: string | null;
  buyerVisible: boolean;
  imagePath: string | null;
  currentPrice: { amount: number; currency: string } | null;
  version: number;
}
export interface PlatformCatalogPage {
  items: PlatformCatalogProduct[];
  page: number;
  size: number;
  total: number;
}

export interface PlatformCatalogTaxonomy {
  id: string;
  name: string;
  description: string | null;
  status: string;
}
export interface PlatformCatalogTaxonomyPage {
  items: PlatformCatalogTaxonomy[];
  page: number;
  size: number;
  total: number;
}
@Injectable({ providedIn: "root" })
export class NexaPlatformCatalogApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl;
  detail(id: string): Observable<PlatformCatalogProduct> {
    return this.http.get<PlatformCatalogProduct>(
      `${this.base}/catalog/products/${encodeURIComponent(id)}`,
    );
  }
  taxonomy(
    kind: "categories" | "brands",
    search = "",
    page = 0,
  ): Observable<PlatformCatalogTaxonomyPage> {
    return this.http.get<PlatformCatalogTaxonomyPage>(
      `${this.base}/catalog/${kind}`,
      {
        params: new HttpParams()
          .set("search", search)
          .set("page", page)
          .set("size", 25),
      },
    );
  }
  list(
    search = "",
    page = 0,
    status = "",
    brand = "",
    category = "",
  ): Observable<PlatformCatalogPage> {
    let params = new HttpParams()
      .set("search", search.trim())
      .set("page", page)
      .set("size", 25)
      .set("status", status);
    if (brand.trim()) params = params.set("brand", brand.trim());
    if (category.trim()) params = params.set("category", category.trim());
    return this.http.get<PlatformCatalogPage>(`${this.base}/catalog/products`, {
      params,
    });
  }
}
