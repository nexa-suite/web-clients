import { inject, Injectable } from "@angular/core";
import { NexaApiError, NexaSalesCommitmentApi } from "@nexa/api";
import type { SalesOrder } from "@nexa/api";
import { firstValueFrom } from "rxjs";

const PAGE_SIZE = 25;

/** The small Sales-owned projection needed to select an order for a document request. */
export interface PlatformConfirmedSalesOrder {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly confirmedAt: string;
}

export interface PlatformConfirmedSalesOrderPage {
  readonly items: readonly PlatformConfirmedSalesOrder[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
  readonly totalPages: number;
}

/** Reads Sales Orders through the Sales Commitment API and exposes no write authority. */
@Injectable({ providedIn: "root" })
export class PlatformConfirmedSalesOrdersQuery {
  private readonly api = inject(NexaSalesCommitmentApi);

  async list(page: number): Promise<PlatformConfirmedSalesOrderPage> {
    if (!Number.isSafeInteger(page) || page < 0) {
      throw new RangeError("Sales Order page must be a non-negative integer.");
    }

    const result = await firstValueFrom(
      this.api.listSalesOrders({ page, size: PAGE_SIZE }),
    );
    if (
      !isRecord(result) ||
      !Array.isArray(result.items) ||
      !isNonNegativeInteger(result.page) ||
      !isPositiveInteger(result.size) ||
      !isNonNegativeInteger(result.total) ||
      result.page !== page
    ) {
      throw new Error("The Sales API returned an invalid Sales Order page.");
    }

    return {
      items: (result.items as readonly SalesOrder[])
        .filter((order) => order.confirmedAt !== null)
        .map(mapConfirmedOrder),
      page: result.page,
      size: result.size,
      total: result.total,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / result.size),
    };
  }

  async get(orderId: string): Promise<PlatformConfirmedSalesOrder | null> {
    const id = orderId.trim();
    if (!id) return null;

    let response;
    try {
      response = await firstValueFrom(this.api.getSalesOrder(id));
    } catch (error) {
      if (error instanceof NexaApiError && error.kind === "not-found") {
        return null;
      }
      throw error;
    }
    if (!response.body) {
      throw new Error("The Sales API returned an empty Sales Order.");
    }
    if (response.body.confirmedAt === null) return null;
    return mapConfirmedOrder(response.body);
  }
}

function mapConfirmedOrder(value: SalesOrder): PlatformConfirmedSalesOrder {
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.number) ||
    !isNonEmptyString(value.status) ||
    !isNonEmptyString(value.confirmedAt)
  ) {
    throw new Error("The Sales API returned an invalid confirmed Sales Order.");
  }

  return {
    id: value.id,
    number: value.number,
    status: value.status,
    confirmedAt: value.confirmedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
