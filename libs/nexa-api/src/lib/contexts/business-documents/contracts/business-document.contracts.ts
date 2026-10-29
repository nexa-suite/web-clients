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

/** Evidence object returned by BC-09 upload and status-read endpoints. */
export interface BusinessDocumentEvidenceResponse {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly lifecycleStatus: string;
  readonly declaredContentType: string;
  readonly detectedContentType: string | null;
  readonly originalFilename: string;
  readonly checksumSha256: string | null;
  readonly byteSize: number;
  readonly createdAt: string;
  readonly scannedAt: string | null;
  readonly failureCode: string | null;
  readonly updatedAt: string;
  readonly requestedByMembershipId: string | null;
}

/** Current BC-09 server-side evidence size bound. */
export const BUSINESS_DOCUMENT_EVIDENCE_MAX_BYTES = 10_485_760;

export interface BusinessDocumentEvidenceResourceResponse {
  readonly body: BusinessDocumentEvidenceResponse;
  readonly status: number;
}
