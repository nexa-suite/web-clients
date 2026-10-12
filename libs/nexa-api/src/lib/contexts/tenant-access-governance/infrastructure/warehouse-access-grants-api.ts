import {
  HttpClient,
  HttpHeaders,
  HttpParams,
  type HttpResponse,
} from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type {
  GrantWarehouseAccessRequest,
  WarehouseAccessGrantResponse,
  WarehousePageResponse,
} from "../contracts/warehouse-access-grants.contracts";
import { NEXA_WAREHOUSE_ACCESS_API_PATHS } from "../contracts/warehouse-access-grants.contracts";

/** Transport for server-authoritative Warehouse access grants. */
@Injectable({ providedIn: "root" })
export class NexaWarehouseAccessGrantsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl;

  listWarehouses(page = 0, size = 100): Observable<WarehousePageResponse> {
    requirePage(page, size);
    return this.http.get<WarehousePageResponse>(
      this.url(NEXA_WAREHOUSE_ACCESS_API_PATHS.warehouses),
      {
        params: new HttpParams()
          .set("page", page)
          .set("size", size)
          .set("sort", "code,asc"),
      },
    );
  }

  listAccessGrants(
    warehouseId: string,
  ): Observable<readonly WarehouseAccessGrantResponse[]> {
    return this.http.get<readonly WarehouseAccessGrantResponse[]>(
      this.warehouseGrantsPath(warehouseId),
    );
  }

  grantAccess(
    warehouseId: string,
    membershipId: string,
    expectedVersion?: number,
  ): Observable<HttpResponse<WarehouseAccessGrantResponse>> {
    requireVersion(expectedVersion, true);
    const request: GrantWarehouseAccessRequest = {
      membershipId: requireId(membershipId),
    };
    const headers =
      expectedVersion === undefined
        ? undefined
        : new HttpHeaders({ "If-Match": quoteVersion(expectedVersion) });
    return this.http
      .post<WarehouseAccessGrantResponse>(
        this.warehouseGrantsPath(warehouseId),
        request,
        { headers, observe: "response" },
      )
      .pipe(map(requireBody("Warehouse grant response body is missing.")));
  }

  revokeAccess(
    warehouseId: string,
    membershipId: string,
    expectedVersion: number,
  ): Observable<HttpResponse<WarehouseAccessGrantResponse>> {
    requireVersion(expectedVersion, false);
    return this.http
      .delete<WarehouseAccessGrantResponse>(
        `${this.warehouseGrantsPath(warehouseId)}/${encodeURIComponent(requireId(membershipId))}`,
        {
          headers: new HttpHeaders({
            "If-Match": quoteVersion(expectedVersion),
          }),
          observe: "response",
        },
      )
      .pipe(map(requireBody("Warehouse grant response body is missing.")));
  }

  private warehouseGrantsPath(warehouseId: string): string {
    return `${this.url(NEXA_WAREHOUSE_ACCESS_API_PATHS.warehouses)}/${encodeURIComponent(requireId(warehouseId))}/access-grants`;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}

function requirePage(page: number, size: number): void {
  if (!Number.isSafeInteger(page) || page < 0)
    throw new RangeError("Warehouse page must be a non-negative integer.");
  if (!Number.isSafeInteger(size) || size !== 100)
    throw new RangeError("Warehouse page size must be 100.");
}

function requireId(value: string): string {
  const id = value.trim();
  if (!id || id.length > 200)
    throw new Error("A valid Warehouse and membership identifier is required.");
  return id;
}

function requireVersion(value: number | undefined, optional: boolean): void {
  if (optional && value === undefined) return;
  if (!Number.isSafeInteger(value) || (value ?? -1) < 0)
    throw new RangeError("Current Warehouse grant version is required.");
}

function quoteVersion(version: number): string {
  return `"${version}"`;
}

function requireBody(message: string) {
  return (response: HttpResponse<WarehouseAccessGrantResponse>) => {
    if (!response.body) throw new Error(message);
    return response;
  };
}
