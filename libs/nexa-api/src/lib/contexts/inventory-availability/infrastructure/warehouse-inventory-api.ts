import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable, map } from "rxjs";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import {
  NEXA_WAREHOUSE_INVENTORY_API_PATHS,
  type ReceiveWarehouseStockRequest,
  type WarehouseInventoryLotResponse,
  type WarehouseInventoryPageResponse,
  type WarehouseInventoryResourceResponse,
  type WarehouseInventoryWarehouseResponse,
  type WarehouseInventoryZoneResponse,
} from "../contracts/warehouse-inventory.contracts";

export interface WarehouseInventoryLotQuery {
  readonly page: number;
  readonly size: number;
  readonly catalogItemId?: string;
  readonly warehouseId?: string;
  readonly zoneId?: string;
  readonly status?: string;
}

/** Warehouse stock transport. Server applies active scope and grant filters. */
@Injectable({ providedIn: "root" })
export class NexaWarehouseInventoryApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(NEXA_API_HTTP_CONFIGURATION).apiBaseUrl;

  listWarehouses(
    page = 0,
    size = 100,
  ): Observable<WarehouseInventoryPageResponse<WarehouseInventoryWarehouseResponse>> {
    return this.http.get<
      WarehouseInventoryPageResponse<WarehouseInventoryWarehouseResponse>
    >(`${this.base}${NEXA_WAREHOUSE_INVENTORY_API_PATHS.warehouses}`, {
      params: { page, size, sort: "code,asc" },
    });
  }

  listZones(
    warehouseId: string,
    page = 0,
    size = 100,
  ): Observable<WarehouseInventoryPageResponse<WarehouseInventoryZoneResponse>> {
    return this.http.get<
      WarehouseInventoryPageResponse<WarehouseInventoryZoneResponse>
    >(
      `${this.base}${NEXA_WAREHOUSE_INVENTORY_API_PATHS.warehouses}/${encodeURIComponent(warehouseId)}/zones`,
      { params: { page, size } },
    );
  }

  listLots(
    query: WarehouseInventoryLotQuery,
  ): Observable<WarehouseInventoryPageResponse<WarehouseInventoryLotResponse>> {
    let params = new HttpParams()
      .set("page", query.page)
      .set("size", query.size)
      .set("sort", "expirationDate,asc");
    for (const key of ["catalogItemId", "warehouseId", "zoneId", "status"] as const) {
      const value = query[key];
      if (value?.trim()) params = params.set(key, value.trim());
    }
    return this.http.get<
      WarehouseInventoryPageResponse<WarehouseInventoryLotResponse>
    >(`${this.base}${NEXA_WAREHOUSE_INVENTORY_API_PATHS.lots}`, { params });
  }

  receive(
    request: ReceiveWarehouseStockRequest,
    idempotencyKey: string,
  ): Observable<WarehouseInventoryResourceResponse<WarehouseInventoryLotResponse>> {
    return this.http
      .post<WarehouseInventoryLotResponse>(
        `${this.base}${NEXA_WAREHOUSE_INVENTORY_API_PATHS.inboundReceipts}`,
        request,
        {
          headers: new HttpHeaders({ "Idempotency-Key": idempotencyKey }),
          observe: "response",
        },
      )
      .pipe(
        map((response) => {
          if (!response.body) {
            throw new Error("Warehouse receipt response body is missing.");
          }
          return {
            body: response.body,
            etag: response.headers.get("ETag"),
            status: response.status,
          };
        }),
      );
  }
}
