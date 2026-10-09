import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type {
  BusinessDocumentPageResponse,
  BusinessDocumentResponse,
  BusinessDocumentsQuery,
} from "../contracts/business-document.contracts";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

@Injectable({ providedIn: "root" })
export class NexaBusinessDocumentsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(NEXA_API_HTTP_CONFIGURATION);

  list(query: BusinessDocumentsQuery = {}) {
    const page = query.page ?? 0;
    const size = query.size ?? DEFAULT_PAGE_SIZE;
    if (!Number.isSafeInteger(page) || page < 0) {
      throw new RangeError(
        "Business document page must be a non-negative integer.",
      );
    }
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
      throw new RangeError(
        "Business document page size must be between 1 and 100.",
      );
    }

    const params: Record<string, string> = {
      page: String(page),
      size: String(size),
    };
    const documentType = query.documentType?.trim();
    const status = query.status?.trim();
    if (documentType) params["documentType"] = documentType;
    if (status) params["status"] = status;

    return this.http.get<BusinessDocumentPageResponse>(
      `${this.config.apiBaseUrl}/business-documents`,
      { params },
    );
  }

  getDocument(documentId: string) {
    const id = requiredDocumentId(documentId);
    return this.http.get<BusinessDocumentResponse>(
      `${this.config.apiBaseUrl}/business-documents/${encodeURIComponent(id)}`,
    );
  }

  download(documentId: string) {
    const id = requiredDocumentId(documentId);
    return this.http.get(
      `${this.config.apiBaseUrl}/business-documents/${encodeURIComponent(id)}/downloads`,
      { observe: "response", responseType: "blob" },
    );
  }
}

function requiredDocumentId(value: string): string {
  const id = value.trim();
  if (!id) throw new Error("Business document ID is required.");
  return id;
}
