import { DOCUMENT } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import type { BuyerBusinessDocument } from "./business-documents.models";
import {
  businessDocumentDownloadFilename,
  BuyerBusinessDocumentDownloadService,
} from "./business-document-download.service";

describe("BuyerBusinessDocumentDownloadService", () => {
  it("uses an isolated object URL and revokes it after the browser has started the download", () => {
    const anchor = {
      href: "",
      download: "",
      rel: "",
      hidden: false,
      click: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    const createObjectURL = vi.fn(() => "blob:https://portal.test/document");
    const revokeObjectURL = vi.fn();
    let revoke: (() => void) | undefined;
    const browser = {
      URL: { createObjectURL, revokeObjectURL },
      setTimeout: vi.fn((callback: () => void, delay: number) => {
        expect(delay).toBe(1_000);
        revoke = callback;
        return 1;
      }),
    } as unknown as Window & typeof globalThis;
    const document = {
      defaultView: browser,
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => anchor),
    } as unknown as Document;

    TestBed.configureTestingModule({
      providers: [
        BuyerBusinessDocumentDownloadService,
        { provide: DOCUMENT, useValue: document },
      ],
    });
    const downloader = TestBed.inject(BuyerBusinessDocumentDownloadService);
    const blob = new Blob(["issued document"], { type: "application/pdf" });

    downloader.download(blob, "order-summary-doc-1.pdf");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe("blob:https://portal.test/document");
    expect(anchor.download).toBe("order-summary-doc-1.pdf");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    revoke?.();

    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:https://portal.test/document",
    );
  });

  it("builds a path-safe filename from the server document identity and format", () => {
    const document: Pick<
      BuyerBusinessDocument,
      "documentType" | "id" | "format"
    > = {
      documentType: "ORDER/SUMMARY",
      id: "doc/with/path",
      format: "PDF",
    };

    expect(businessDocumentDownloadFilename(document)).toBe(
      "ORDER_SUMMARY-doc_with_path.pdf",
    );
  });
});
