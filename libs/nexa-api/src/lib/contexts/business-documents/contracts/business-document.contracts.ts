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
