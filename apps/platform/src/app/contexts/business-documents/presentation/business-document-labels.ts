export function platformBusinessDocumentTypeLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    ORDER_SUMMARY: "Order summary",
    SALES_ORDER: "Sales order",
    INVOICE: "Invoice",
    CREDIT_NOTE: "Credit note",
    RECEIPT: "Receipt",
    STATEMENT: "Statement",
  };
  return labels[value] ?? humanize(value);
}

export function platformBusinessDocumentStatusLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    REQUESTED: "Requested",
    GENERATING: "Generating",
    GENERATED: "Available",
    SUPERSEDED: "Superseded",
    FAILED: "Generation failed",
    CANCELLED: "Cancelled",
  };
  return labels[value] ?? humanize(value);
}

export function platformBusinessDocumentSubjectLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    SALES_ORDER: "Sales order",
    PURCHASE_REQUEST: "Purchase request",
    CLIENT_ACCOUNT: "Client account",
    RECEIVABLE: "Receivable",
  };
  return labels[value] ?? humanize(value);
}

function humanize(value: string): string {
  const normalized = value.trim().replace(/[_-]+/g, " ").toLowerCase();
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}
