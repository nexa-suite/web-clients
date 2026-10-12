export interface BusinessDocumentPageResponse {
  readonly items: readonly BusinessDocumentResponse[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface BusinessDocumentResponse {
  readonly id: string;
  readonly clientAccountId: string | null;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly documentType: string;
  readonly documentNumber: string | null;
  readonly version: number;
  readonly status: string;
  readonly format: string;
  readonly storageObjectKey: string | null;
  readonly checksumSha256: string | null;
  readonly contentType: string | null;
  readonly byteSize: number;
  readonly generatedAt: string | null;
  readonly failureCode: string | null;
  readonly failureDetail: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replacementOfDocumentId: string | null;
}

export interface BusinessDocumentsQuery {
  readonly page?: number;
  readonly size?: number;
  readonly documentType?: string;
  readonly status?: string;
}

/** Explicit Sales Order ORDER_SUMMARY PDF request supported by the current API. */
export interface OrderSummaryPdfGenerationRequest {
  readonly subjectType: "SALES_ORDER";
  readonly subjectId: string;
  readonly documentType: "ORDER_SUMMARY";
  readonly format: "PDF";
}

export interface BusinessDocumentGenerationRequestResponse {
  readonly id: string;
  readonly documentId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly documentType: string;
  readonly format: string;
  readonly status: string;
  readonly requestedAt: string;
  readonly completedAt: string | null;
}
