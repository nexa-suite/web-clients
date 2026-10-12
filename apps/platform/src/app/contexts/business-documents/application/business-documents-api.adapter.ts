import { inject, Injectable } from "@angular/core";
import { NexaApiError, NexaBusinessDocumentsApi } from "@nexa/api";
import type {
  BusinessDocumentResponse,
  BusinessDocumentPageResponse,
  BusinessDocumentGenerationRequestResponse,
} from "@nexa/api";
import { firstValueFrom } from "rxjs";
import type {
  PlatformBusinessDocument,
  PlatformBusinessDocumentPage,
} from "./business-documents.models";

const PAGE_SIZE = 25;
const DOWNLOADABLE_STATUSES = new Set(["GENERATED", "SUPERSEDED"]);
const FORMATS = new Set(["PDF", "CSV", "XML"]);

@Injectable({ providedIn: "root" })
export class PlatformBusinessDocumentsApiAdapter {
  private readonly api = inject(NexaBusinessDocumentsApi);

  async list(page: number): Promise<PlatformBusinessDocumentPage> {
    const response = await firstValueFrom(
      this.api.list({ page, size: PAGE_SIZE }),
    );
    if (
      !isRecord(response) ||
      !Array.isArray(response.items) ||
      !isNonNegativeInteger(response.page) ||
      !isPositiveInteger(response.size) ||
      !isNonNegativeInteger(response.total) ||
      response.page !== page
    ) {
      throw invalidApiResponse();
    }

    return {
      items: (response as BusinessDocumentPageResponse).items.map(mapDocument),
      page: response.page,
      size: response.size,
      total: response.total,
      totalPages:
        response.total === 0 ? 0 : Math.ceil(response.total / response.size),
    };
  }

  async detail(documentId: string): Promise<PlatformBusinessDocument> {
    return mapDocument(await firstValueFrom(this.api.getDocument(documentId)));
  }

  async download(documentId: string): Promise<Blob> {
    const response = await firstValueFrom(this.api.download(documentId));
    if (!response.body) throw invalidApiResponse();
    return response.body;
  }

  async requestOrderSummaryPdf(
    salesOrderId: string,
    idempotencyKey: string,
  ): Promise<PlatformOrderSummaryRequest> {
    const response = await firstValueFrom(
      this.api.requestOrderSummaryPdf(salesOrderId, idempotencyKey),
    );
    return mapOrderSummaryRequest(response, salesOrderId);
  }
}

export interface PlatformOrderSummaryRequest {
  readonly id: string;
  readonly documentId: string;
  readonly status: string;
  readonly requestedAt: string;
  readonly completedAt: string | null;
}

function mapDocument(
  value: BusinessDocumentResponse,
): PlatformBusinessDocument {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.subjectType) ||
    !isNonEmptyString(value.subjectId) ||
    !isNonEmptyString(value.documentType) ||
    !isNonEmptyString(value.status) ||
    !isNonEmptyString(value.format) ||
    !FORMATS.has(value.format) ||
    !isPositiveInteger(value.version) ||
    !isNonNegativeInteger(value.byteSize) ||
    !isOptionalString(value.documentNumber) ||
    !isOptionalString(value.contentType) ||
    !isOptionalString(value.generatedAt) ||
    !isNonEmptyString(value.createdAt) ||
    !isOptionalString(value.replacementOfDocumentId)
  ) {
    throw invalidApiResponse();
  }

  return {
    id: value.id,
    subjectType: value.subjectType,
    subjectId: value.subjectId,
    documentType: value.documentType,
    documentNumber: value.documentNumber,
    version: value.version,
    status: value.status,
    format: value.format as PlatformBusinessDocument["format"],
    contentType: value.contentType,
    byteSize: value.byteSize,
    generatedAt: value.generatedAt,
    createdAt: value.createdAt,
    replacementOfDocumentId: value.replacementOfDocumentId,
    downloadable:
      DOWNLOADABLE_STATUSES.has(value.status) &&
      isNonEmptyString(value.storageObjectKey),
  };
}

function mapOrderSummaryRequest(
  value: BusinessDocumentGenerationRequestResponse,
  salesOrderId: string,
): PlatformOrderSummaryRequest {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.documentId) ||
    value.subjectType !== "SALES_ORDER" ||
    value.subjectId !== salesOrderId ||
    value.documentType !== "ORDER_SUMMARY" ||
    value.format !== "PDF" ||
    !isNonEmptyString(value.status) ||
    !isNonEmptyString(value.requestedAt) ||
    !isOptionalString(value.completedAt)
  ) {
    throw invalidApiResponse();
  }

  return {
    id: value.id,
    documentId: value.documentId,
    status: value.status,
    requestedAt: value.requestedAt,
    completedAt: value.completedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function invalidApiResponse(): NexaApiError {
  return new NexaApiError("unknown", null, null);
}
