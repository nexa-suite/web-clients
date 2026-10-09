export interface PlatformBusinessDocument {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly documentType: string;
  readonly documentNumber: string | null;
  readonly version: number;
  readonly status: string;
  readonly format: "PDF" | "CSV" | "XML";
  readonly contentType: string | null;
  readonly byteSize: number;
  readonly generatedAt: string | null;
  readonly createdAt: string;
  readonly replacementOfDocumentId: string | null;
  readonly downloadable: boolean;
}

export interface PlatformBusinessDocumentPage {
  readonly items: readonly PlatformBusinessDocument[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
  readonly totalPages: number;
}

export type PlatformBusinessDocumentListState =
  | { readonly kind: "idle"; readonly page: null }
  | {
      readonly kind: "loading";
      readonly page: null;
      readonly requestedPage: number;
    }
  | {
      readonly kind: "error";
      readonly page: null;
      readonly requestedPage: number;
      readonly errorMessage: string;
    }
  | { readonly kind: "empty"; readonly page: PlatformBusinessDocumentPage }
  | { readonly kind: "results"; readonly page: PlatformBusinessDocumentPage };

export type PlatformBusinessDocumentDetailState =
  | { readonly kind: "idle"; readonly document: null }
  | {
      readonly kind: "loading";
      readonly document: null;
      readonly documentId: string;
    }
  | {
      readonly kind: "error";
      readonly document: null;
      readonly documentId: string;
      readonly errorMessage: string;
    }
  | { readonly kind: "not-found"; readonly document: null }
  | { readonly kind: "loaded"; readonly document: PlatformBusinessDocument };

export type PlatformBusinessDocumentDownloadState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly documentId: string }
  | {
      readonly kind: "error";
      readonly documentId: string;
      readonly errorMessage: string;
    };
