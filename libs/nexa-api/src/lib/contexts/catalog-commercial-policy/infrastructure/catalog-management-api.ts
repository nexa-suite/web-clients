import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type {
  CatalogCommandPage,
  CreateBrandRequest,
  CreateCategoryRequest,
  CreateProductFamilyRequest,
  CreateProductVariantRequest,
  CreateSellableSkuRequest,
  CreateSkuPriceRequest,
  ManagedBrand,
  ManagedCategory,
  ProductFamilySummary,
  ProductVariantSummary,
  SellableSkuSummary,
  SkuPrice,
} from "../contracts/catalog-management.contracts";

@Injectable({ providedIn: "root" })
export class NexaPlatformCatalogManagementApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl;
  private readonly taxonomyPath = `${this.base}/catalog`;
  private readonly familyPath = `${this.base}/product-families`;

  categories(search = "", page = 0): Observable<CatalogCommandPage<ManagedCategory>> {
    return this.http.get<CatalogCommandPage<ManagedCategory>>(
      `${this.taxonomyPath}/categories`,
      { params: this.pageParams(search, page) },
    );
  }

  category(id: string): Observable<ManagedCategory> {
    return this.http.get<ManagedCategory>(
      `${this.taxonomyPath}/categories/${encodeURIComponent(id)}`,
    );
  }

  createCategory(
    request: CreateCategoryRequest,
    idempotencyKey: string,
  ): Observable<ManagedCategory> {
    return this.http.post<ManagedCategory>(
      `${this.taxonomyPath}/categories`,
      request,
      this.idempotency(idempotencyKey),
    );
  }

  updateCategory(
    id: string,
    version: number,
    request: CreateCategoryRequest,
  ): Observable<ManagedCategory> {
    return this.http.patch<ManagedCategory>(
      `${this.taxonomyPath}/categories/${encodeURIComponent(id)}`,
      request,
      this.ifMatch(version),
    );
  }

  changeCategoryStatus(
    id: string,
    version: number,
    status: "ACTIVE" | "INACTIVE",
  ): Observable<ManagedCategory> {
    return this.changeStatus(`${this.taxonomyPath}/categories`, id, version, status);
  }

  brands(search = "", page = 0): Observable<CatalogCommandPage<ManagedBrand>> {
    return this.http.get<CatalogCommandPage<ManagedBrand>>(
      `${this.taxonomyPath}/brands`,
      { params: this.pageParams(search, page) },
    );
  }

  brand(id: string): Observable<ManagedBrand> {
    return this.http.get<ManagedBrand>(
      `${this.taxonomyPath}/brands/${encodeURIComponent(id)}`,
    );
  }

  createBrand(
    request: CreateBrandRequest,
    idempotencyKey: string,
  ): Observable<ManagedBrand> {
    return this.http.post<ManagedBrand>(
      `${this.taxonomyPath}/brands`,
      request,
      this.idempotency(idempotencyKey),
    );
  }

  updateBrand(
    id: string,
    version: number,
    request: CreateBrandRequest,
  ): Observable<ManagedBrand> {
    return this.http.patch<ManagedBrand>(
      `${this.taxonomyPath}/brands/${encodeURIComponent(id)}`,
      request,
      this.ifMatch(version),
    );
  }

  changeBrandStatus(
    id: string,
    version: number,
    status: "ACTIVE" | "INACTIVE",
  ): Observable<ManagedBrand> {
    return this.changeStatus(`${this.taxonomyPath}/brands`, id, version, status);
  }

  families(
    search = "",
    page = 0,
    brand = "",
    category = "",
  ): Observable<CatalogCommandPage<ProductFamilySummary>> {
    let params = this.pageParams(search, page);
    if (brand.trim()) params = params.set("brand", brand.trim());
    if (category.trim()) params = params.set("category", category.trim());
    return this.http.get<CatalogCommandPage<ProductFamilySummary>>(
      this.familyPath,
      { params },
    );
  }

  createFamily(request: CreateProductFamilyRequest): Observable<ProductFamilySummary> {
    return this.http.post<ProductFamilySummary>(this.familyPath, request);
  }

  changeFamilyStatus(
    id: string,
    version: number,
    status: "ACTIVE" | "INACTIVE",
  ): Observable<ProductFamilySummary> {
    return this.changeStatus(this.familyPath, id, version, status);
  }

  variants(
    familyId: string,
    search = "",
    page = 0,
  ): Observable<CatalogCommandPage<ProductVariantSummary>> {
    return this.http.get<CatalogCommandPage<ProductVariantSummary>>(
      `${this.familyPath}/${encodeURIComponent(familyId)}/variants`,
      { params: this.pageParams(search, page) },
    );
  }

  createVariant(
    familyId: string,
    request: CreateProductVariantRequest,
    idempotencyKey: string,
  ): Observable<ProductVariantSummary> {
    return this.http.post<ProductVariantSummary>(
      `${this.familyPath}/${encodeURIComponent(familyId)}/variants`,
      request,
      this.idempotency(idempotencyKey),
    );
  }

  skus(
    familyId: string,
    search = "",
    page = 0,
  ): Observable<CatalogCommandPage<SellableSkuSummary>> {
    return this.http.get<CatalogCommandPage<SellableSkuSummary>>(
      `${this.familyPath}/${encodeURIComponent(familyId)}/skus`,
      { params: this.pageParams(search, page) },
    );
  }

  createSku(
    familyId: string,
    request: CreateSellableSkuRequest,
  ): Observable<SellableSkuSummary> {
    return this.http.post<SellableSkuSummary>(
      `${this.familyPath}/${encodeURIComponent(familyId)}/skus`,
      request,
    );
  }

  changeSkuStatus(
    id: string,
    version: number,
    status: "ACTIVE" | "INACTIVE",
  ): Observable<SellableSkuSummary> {
    return this.changeStatus(`${this.base}/skus`, id, version, status);
  }

  prices(skuId: string): Observable<readonly SkuPrice[]> {
    return this.http.get<readonly SkuPrice[]>(
      `${this.base}/skus/${encodeURIComponent(skuId)}/prices`,
    );
  }

  createPrice(
    skuId: string,
    request: CreateSkuPriceRequest,
    idempotencyKey: string,
  ): Observable<SkuPrice> {
    return this.http.post<SkuPrice>(
      `${this.base}/skus/${encodeURIComponent(skuId)}/prices`,
      request,
      this.idempotency(idempotencyKey),
    );
  }

  private changeStatus<T extends ManagedCategory | ManagedBrand | ProductFamilySummary | SellableSkuSummary>(
    collectionPath: string,
    id: string,
    version: number,
    status: "ACTIVE" | "INACTIVE",
  ): Observable<T> {
    const action = status === "ACTIVE" ? "activations" : "deactivations";
    return this.http.post<T>(
      `${collectionPath}/${encodeURIComponent(id)}/${action}`,
      null,
      this.ifMatch(version),
    );
  }

  private pageParams(search: string, page: number): HttpParams {
    return new HttpParams()
      .set("search", search.trim())
      .set("page", page)
      .set("size", 25);
  }

  private idempotency(key: string): { headers: HttpHeaders } {
    return { headers: new HttpHeaders({ "Idempotency-Key": key }) };
  }

  private ifMatch(version: number): { headers: HttpHeaders } {
    return { headers: new HttpHeaders({ "If-Match": `"${version}"` }) };
  }
}
