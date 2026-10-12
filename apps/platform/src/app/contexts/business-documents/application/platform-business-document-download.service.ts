import { DOCUMENT } from "@angular/common";
import { inject, Injectable } from "@angular/core";
import type { PlatformBusinessDocument } from "./business-documents.models";

const FORMAT_EXTENSIONS: Readonly<
  Record<PlatformBusinessDocument["format"], string>
> = {
  PDF: "pdf",
  CSV: "csv",
  XML: "xml",
};

@Injectable({ providedIn: "root" })
export class PlatformBusinessDocumentDownloadService {
  private readonly document = inject(DOCUMENT);

  download(content: Blob, filename: string): void {
    const browser = this.document.defaultView as
      | (Window & typeof globalThis)
      | null;
    if (
      !browser ||
      !this.document.body ||
      typeof browser.URL.createObjectURL !== "function"
    ) {
      throw new Error("Downloads are unavailable in this browser context.");
    }

    const objectUrl = browser.URL.createObjectURL(content);
    const anchor = this.document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeFilename(filename);
    anchor.rel = "noopener";
    anchor.hidden = true;

    let revocationScheduled = false;
    try {
      this.document.body.appendChild(anchor);
      anchor.click();
      browser.setTimeout(() => browser.URL.revokeObjectURL(objectUrl), 1_000);
      revocationScheduled = true;
    } finally {
      try {
        anchor.remove();
      } finally {
        if (!revocationScheduled) browser.URL.revokeObjectURL(objectUrl);
      }
    }
  }
}

export function platformBusinessDocumentDownloadFilename(
  document: Pick<
    PlatformBusinessDocument,
    "documentNumber" | "documentType" | "id" | "format"
  >,
): string {
  const basis = document.documentNumber || document.documentType;
  const safeBasis = safeFilenamePart(basis) || "business-document";
  const safeId = safeFilenamePart(document.id);
  const extension = FORMAT_EXTENSIONS[document.format];
  return `${safeBasis}${safeId ? `-${safeId}` : ""}.${extension}`;
}

function safeFilename(value: string): string {
  const filename = value
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "");
  return filename || "business-document";
}

function safeFilenamePart(value: string): string {
  return value
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}
