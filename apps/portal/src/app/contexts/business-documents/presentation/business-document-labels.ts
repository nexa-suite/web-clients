const DOCUMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  ORDER_SUMMARY: "Sales order document",
  PURCHASE_REQUEST_SUMMARY: "Purchase request summary",
  COMMERCIAL_INVOICE_DRAFT: "Commercial invoice",
  DELIVERY_GUIDE_DRAFT: "Delivery note",
  POD_REPORT: "Delivery proof",
  INCIDENT_REPORT: "Delivery incident report",
  PAYMENT_RECEIPT: "Payment receipt",
};

const DOCUMENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  REQUESTED: "Processing",
  GENERATING: "Processing",
  GENERATED: "Available",
  FAILED: "Unavailable",
  SUPERSEDED: "Replaced",
  VOIDED: "Voided",
};

const SUBJECT_LABELS: Readonly<Record<string, string>> = {
  SALES_ORDER: "Sales order",
  PURCHASE_REQUEST: "Purchase request",
  PAYMENT: "Payment",
  DELIVERY: "Delivery",
};

export function businessDocumentTypeLabel(value: string): string {
  return DOCUMENT_TYPE_LABELS[value] ?? readableCode(value);
}

export function businessDocumentStatusLabel(value: string): string {
  return DOCUMENT_STATUS_LABELS[value] ?? readableCode(value);
}

export function businessDocumentSubjectLabel(value: string): string {
  return SUBJECT_LABELS[value] ?? readableCode(value);
}

function readableCode(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
