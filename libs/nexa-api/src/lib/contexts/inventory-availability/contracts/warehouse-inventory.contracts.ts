export const NEXA_WAREHOUSE_INVENTORY_API_PATHS = {
  warehouses: "/warehouses",
  lots: "/inventory/lots",
  inboundReceipts: "/inventory/inbound-receipts",
} as const;

export interface WarehouseInventoryPageResponse<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface WarehouseInventoryWarehouseResponse {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly version: number;
}

export interface WarehouseInventoryZoneResponse {
  readonly id: string;
  readonly warehouseId: string;
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly temperatureMin: number | null;
  readonly temperatureMax: number | null;
  readonly status: string;
  readonly version: number;
}

export interface WarehouseInventoryLotResponse {
  readonly id: string;
  readonly warehouseId: string;
  readonly zoneId: string;
  readonly catalogItemId: string;
  readonly batchNumber: string;
  readonly expirationDate: string;
  readonly receivedAt: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly unit: string;
  readonly status: string;
  readonly version: number;
  readonly skuId: string | null;
  readonly productionDate: string | null;
}

export interface ReceiveWarehouseStockRequest {
  readonly warehouseId: string;
  readonly zoneId: string;
  readonly catalogItemId: string;
  readonly batchNumber: string;
  readonly expirationDate: string;
  readonly quantity: number;
  readonly unit: string;
  readonly temperatureReading?: number | null;
  readonly notes?: string | null;
  readonly skuId?: string | null;
  readonly temperatureEvidenceObjectId?: string | null;
  readonly productionDate?: string | null;
  readonly receivedAt?: string | null;
}

export interface WarehouseInventoryResourceResponse<T> {
  readonly body: T;
  readonly etag: string | null;
  readonly status: number;
}
