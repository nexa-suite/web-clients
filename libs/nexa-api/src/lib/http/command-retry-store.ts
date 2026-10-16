import { DOCUMENT } from "@angular/common";
import { Injectable, inject } from "@angular/core";
import { BUSINESS_DOCUMENT_EVIDENCE_MAX_BYTES } from "../contexts/business-documents/contracts/business-document.contracts";

const BUYER_SUBMIT_PREFIX = "nexa:buyer:purchase-request-submit:";
const PLATFORM_REVIEW_PREFIX = "nexa:platform:purchase-request-command:";
const PLATFORM_MATERIAL_CHANGE_PREFIX =
  "nexa:platform:purchase-request-material-change:";
const PLATFORM_FULFILLMENT_PREFIX = "nexa.platform.fulfillment-start:";
const PLATFORM_ORDER_SUMMARY_PREFIX = "nexa:platform:order-summary-generation:";
const PLATFORM_FULFILLMENT_COMMAND_PREFIX =
  "nexa:platform:fulfillment-command:";
const BUYER_BANK_TRANSFER_PREFIX = "nexa:buyer:bank-transfer:";
const PLATFORM_MEMBER_INVITATION_PREFIX = "nexa:platform:member-invitation:";
const PLATFORM_CREDIT_CONFIGURATION_PREFIX =
  "nexa:platform:credit-configuration:";
const PLATFORM_CATALOG_COMMAND_PREFIX = "nexa:platform:catalog-command:";
const PLATFORM_INVENTORY_RECEIPT_PREFIX = "nexa:platform:inventory-receipt:";
const PLATFORM_INVENTORY_EVIDENCE_PREFIX = "nexa:platform:inventory-evidence:";
const PLATFORM_WALLET_REFUND_PREFIX = "nexa:platform:wallet-refund:";
const BUYER_WALLET_RECHARGE_PREFIX = "nexa:buyer:wallet-recharge:";
const BUYER_WALLET_RECHARGE_PENDING_PREFIX =
  "nexa:buyer:wallet-recharge-pending:";
const BUYER_WALLET_RECHARGE_STATUS_PREFIX =
  "nexa:buyer:wallet-recharge-status:";
const MAX_STORAGE_KEY_LENGTH = 2_048;
const MAX_STORAGE_VALUE_LENGTH = 65_536;

interface PendingReviewCommand {
  readonly action: "convert" | "reject";
  readonly version: number;
  readonly note: string;
  readonly key: string;
}

@Injectable({ providedIn: "root" })
export class NexaCommandRetryStore {
  private readonly document = inject(DOCUMENT);
  private readonly memory = new Map<string, string>();
  private readonly removed = new Set<string>();

  read(key: string): string | null {
    assertAllowedKey(key);
    if (this.removed.has(key)) return null;

    const storage = this.sessionStorage();
    if (storage) {
      try {
        const value = storage.getItem(key);
        if (value !== null) {
          if (isAllowedValue(key, value)) {
            this.memory.set(key, value);
            return value;
          }
          this.memory.delete(key);
          try {
            storage.removeItem(key);
          } catch {
            // Invalid persisted data is ignored when the browser blocks cleanup.
          }
          return null;
        }
      } catch {
        // Use the in-memory copy when session storage is unavailable.
      }
    }

    const value = this.memory.get(key);
    return value !== undefined && isAllowedValue(key, value) ? value : null;
  }

  write(key: string, value: string): void {
    assertAllowedKey(key);
    if (!isAllowedValue(key, value)) {
      throw new TypeError(
        "The retry value is not an allowed Nexa command payload.",
      );
    }

    this.memory.set(key, value);
    this.removed.delete(key);
    const storage = this.sessionStorage();
    if (!storage) return;
    try {
      storage.setItem(key, value);
    } catch {
      // Preserve the pending command in memory when session storage is blocked.
    }
  }

  remove(key: string): void {
    assertAllowedKey(key);
    this.memory.delete(key);
    this.removed.add(key);
    const storage = this.sessionStorage();
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {
      // Keep reads cleared for this runtime when storage refuses cleanup.
    }
  }

  private sessionStorage(): Storage | null {
    try {
      return this.document.defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  }
}

function assertAllowedKey(key: string): void {
  if (
    typeof key !== "string" ||
    key.length > MAX_STORAGE_KEY_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(key) ||
    !allowedPrefixFor(key)
  ) {
    throw new TypeError("Only scoped Nexa command retry keys are supported.");
  }
}

function allowedPrefixFor(key: string): string | null {
  const prefix = [
    BUYER_SUBMIT_PREFIX,
    PLATFORM_REVIEW_PREFIX,
    PLATFORM_MATERIAL_CHANGE_PREFIX,
    PLATFORM_FULFILLMENT_PREFIX,
    PLATFORM_ORDER_SUMMARY_PREFIX,
    PLATFORM_FULFILLMENT_COMMAND_PREFIX,
    BUYER_BANK_TRANSFER_PREFIX,
    PLATFORM_MEMBER_INVITATION_PREFIX,
    PLATFORM_CREDIT_CONFIGURATION_PREFIX,
    PLATFORM_CATALOG_COMMAND_PREFIX,
    PLATFORM_INVENTORY_EVIDENCE_PREFIX,
    PLATFORM_INVENTORY_RECEIPT_PREFIX,
    PLATFORM_WALLET_REFUND_PREFIX,
    BUYER_WALLET_RECHARGE_PREFIX,
    BUYER_WALLET_RECHARGE_PENDING_PREFIX,
    BUYER_WALLET_RECHARGE_STATUS_PREFIX,
  ].find((candidate) => key.startsWith(candidate));
  if (!prefix) return null;

  const expectedSegments = new Map([
    [BUYER_SUBMIT_PREFIX, 4],
    [PLATFORM_REVIEW_PREFIX, 4],
    [PLATFORM_MATERIAL_CHANGE_PREFIX, 4],
    [PLATFORM_FULFILLMENT_PREFIX, 6],
    [PLATFORM_ORDER_SUMMARY_PREFIX, 5],
    [PLATFORM_FULFILLMENT_COMMAND_PREFIX, 7],
    [BUYER_BANK_TRANSFER_PREFIX, 6],
    [PLATFORM_MEMBER_INVITATION_PREFIX, 5],
    [PLATFORM_CREDIT_CONFIGURATION_PREFIX, 7],
    [PLATFORM_CATALOG_COMMAND_PREFIX, 7],
    [PLATFORM_INVENTORY_RECEIPT_PREFIX, 4],
    [PLATFORM_INVENTORY_EVIDENCE_PREFIX, 4],
    [PLATFORM_WALLET_REFUND_PREFIX, 6],
    [BUYER_WALLET_RECHARGE_PREFIX, 5],
    [BUYER_WALLET_RECHARGE_PENDING_PREFIX, 4],
    [BUYER_WALLET_RECHARGE_STATUS_PREFIX, 4],
  ]).get(prefix);
  const segments = key.slice(prefix.length).split(":");
  if (segments.length !== expectedSegments) return null;
  if (
    (prefix === PLATFORM_FULFILLMENT_COMMAND_PREFIX ||
      prefix === BUYER_BANK_TRANSFER_PREFIX ||
      prefix === PLATFORM_MEMBER_INVITATION_PREFIX ||
      prefix === PLATFORM_CREDIT_CONFIGURATION_PREFIX ||
      prefix === PLATFORM_CATALOG_COMMAND_PREFIX ||
      prefix === PLATFORM_WALLET_REFUND_PREFIX ||
      prefix === BUYER_WALLET_RECHARGE_PREFIX ||
      prefix === PLATFORM_MATERIAL_CHANGE_PREFIX) &&
    !/^[a-f0-9]{64}$/.test(segments.at(-1) ?? "")
  ) {
    return null;
  }
  if (
    (prefix === PLATFORM_INVENTORY_RECEIPT_PREFIX ||
      prefix === PLATFORM_INVENTORY_EVIDENCE_PREFIX) &&
    !segments.every(isUuid)
  ) {
    return null;
  }
  for (const segment of segments) {
    if (!segment) return null;
    try {
      const decoded = decodeURIComponent(segment);
      if (
        !decoded.trim() ||
        /[\u0000-\u001f\u007f]/.test(decoded) ||
        encodeURIComponent(decoded) !== segment
      ) {
        return null;
      }
    } catch {
      return null;
    }
  }
  return prefix;
}

function isAllowedValue(key: string, value: string): boolean {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_STORAGE_VALUE_LENGTH
  ) {
    return false;
  }

  if (key.startsWith(BUYER_SUBMIT_PREFIX)) {
    return /^buyer-pr-submit-[a-z0-9-]{8,256}$/.test(value);
  }
  if (key.startsWith(BUYER_WALLET_RECHARGE_PENDING_PREFIX)) {
    return isPendingWalletRecharge(value);
  }
  if (
    key.startsWith(PLATFORM_FULFILLMENT_PREFIX) ||
    key.startsWith(PLATFORM_ORDER_SUMMARY_PREFIX) ||
    key.startsWith(PLATFORM_FULFILLMENT_COMMAND_PREFIX) ||
    key.startsWith(BUYER_BANK_TRANSFER_PREFIX) ||
    key.startsWith(PLATFORM_MEMBER_INVITATION_PREFIX) ||
    key.startsWith(PLATFORM_CREDIT_CONFIGURATION_PREFIX) ||
    key.startsWith(PLATFORM_CATALOG_COMMAND_PREFIX) ||
    key.startsWith(PLATFORM_WALLET_REFUND_PREFIX) ||
    key.startsWith(BUYER_WALLET_RECHARGE_PREFIX) ||
    key.startsWith(BUYER_WALLET_RECHARGE_STATUS_PREFIX)
  ) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
  if (key.startsWith(PLATFORM_INVENTORY_RECEIPT_PREFIX)) {
    return isPendingInventoryReceipt(value);
  }
  if (key.startsWith(PLATFORM_INVENTORY_EVIDENCE_PREFIX)) {
    return isPendingInventoryEvidence(value);
  }
  if (key.startsWith(PLATFORM_REVIEW_PREFIX)) {
    return isPendingReviewCommand(value);
  }
  if (key.startsWith(PLATFORM_MATERIAL_CHANGE_PREFIX)) {
    return isPendingMaterialChangeCommand(value);
  }
  return false;
}

interface PendingInventoryReceipt {
  readonly idempotencyKey: string;
  readonly request: {
    readonly warehouseId: string;
    readonly zoneId: string;
    readonly catalogItemId: string;
    readonly batchNumber: string;
    readonly expirationDate: string;
    readonly quantity: number;
    readonly unit: string;
    readonly temperatureReading: number | null;
    readonly notes: string | null;
    readonly skuId: string | null;
    readonly productionDate: string;
    readonly receivedAt: string;
  };
}

function isPendingInventoryReceipt(value: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return false;
  const command = parsed as Partial<PendingInventoryReceipt>;
  if (
    Object.keys(parsed).sort().join(",") !== "idempotencyKey,request" ||
    typeof command.idempotencyKey !== "string" ||
    !isUuid(command.idempotencyKey) ||
    !command.request ||
    typeof command.request !== "object" ||
    Array.isArray(command.request)
  ) {
    return false;
  }
  const request = command.request as PendingInventoryReceipt["request"];
  const requestRecord = request as unknown as Record<string, unknown>;
  const evidenceId = requestRecord["temperatureEvidenceObjectId"];
  const requestKeys = Object.keys(requestRecord).sort().join(",");
  if (
    requestKeys !==
      "batchNumber,catalogItemId,expirationDate,notes,productionDate,quantity,receivedAt,skuId,temperatureReading,unit,warehouseId,zoneId" &&
    requestKeys !==
      "batchNumber,catalogItemId,expirationDate,notes,productionDate,quantity,receivedAt,skuId,temperatureEvidenceObjectId,temperatureReading,unit,warehouseId,zoneId"
  ) {
    return false;
  }
  return (
    isUuid(request.warehouseId) &&
    isUuid(request.zoneId) &&
    (request.skuId === null || isUuid(request.skuId)) &&
    (!Object.hasOwn(requestRecord, "temperatureEvidenceObjectId") ||
      evidenceId === null ||
      (typeof evidenceId === "string" && isUuid(evidenceId))) &&
    isBoundedText(request.catalogItemId, 64) &&
    isBoundedText(request.batchNumber, 80) &&
    isBoundedText(request.unit, 32) &&
    isDateOnly(request.expirationDate) &&
    isDateOnly(request.productionDate) &&
    isIsoInstant(request.receivedAt) &&
    typeof request.quantity === "number" &&
    Number.isFinite(request.quantity) &&
    request.quantity > 0 &&
    (request.temperatureReading === null ||
      (typeof request.temperatureReading === "number" &&
        Number.isFinite(request.temperatureReading))) &&
    (request.notes === null ||
      (typeof request.notes === "string" && request.notes.length <= 2000))
  );
}

interface PendingInventoryEvidenceUpload {
  readonly idempotencyKey: string;
  readonly warehouseId: string;
  readonly originalFilename: string;
  readonly declaredContentType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly evidenceId: string | null;
}

function isPendingInventoryEvidence(value: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const command = parsed as Partial<PendingInventoryEvidenceUpload>;
  const keys = Object.keys(parsed).sort().join(",");
  if (
    keys !==
      "byteSize,checksumSha256,declaredContentType,evidenceId,idempotencyKey,originalFilename,warehouseId" ||
    typeof command.idempotencyKey !== "string" ||
    !isUuid(command.idempotencyKey) ||
    typeof command.warehouseId !== "string" ||
    !isUuid(command.warehouseId) ||
    typeof command.originalFilename !== "string" ||
    !isBoundedText(command.originalFilename, 255) ||
    typeof command.declaredContentType !== "string" ||
    !isBoundedText(command.declaredContentType, 160) ||
    !command.declaredContentType.toLowerCase().startsWith("image/") ||
    typeof command.byteSize !== "number" ||
    !Number.isSafeInteger(command.byteSize) ||
    command.byteSize <= 0 ||
    command.byteSize > BUSINESS_DOCUMENT_EVIDENCE_MAX_BYTES ||
    typeof command.checksumSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(command.checksumSha256) ||
    (command.evidenceId !== null &&
      (typeof command.evidenceId !== "string" || !isUuid(command.evidenceId)))
  ) {
    return false;
  }
  return JSON.stringify(parsed) === value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isBoundedText(value: string, maximum: number): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoInstant(value: string): boolean {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

interface PendingMaterialChangeCommand {
  readonly etag: string;
  readonly idempotencyKey: string;
  readonly requestVersion: number;
  readonly fingerprint: string;
}

function isPendingMaterialChangeCommand(value: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return false;
  const command = parsed as Partial<PendingMaterialChangeCommand>;
  const keys = Object.keys(parsed).sort();
  if (
    keys.join(",") !== "etag,fingerprint,idempotencyKey,requestVersion" ||
    typeof command.etag !== "string" ||
    !/^(?:W\/)?"[^"\r\n]*"$/.test(command.etag) ||
    typeof command.idempotencyKey !== "string" ||
    !/^sales-pr-material-change-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      command.idempotencyKey,
    ) ||
    !Number.isSafeInteger(command.requestVersion) ||
    (command.requestVersion as number) < 0 ||
    typeof command.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(command.fingerprint)
  )
    return false;
  return JSON.stringify(parsed) === value;
}

function isPendingWalletRecharge(value: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return false;
  const command = parsed as {
    readonly amount?: unknown;
    readonly fingerprint?: unknown;
    readonly idempotencyKey?: unknown;
  };
  return (
    Object.keys(parsed).join(",") === "amount,fingerprint,idempotencyKey" &&
    typeof command.amount === "number" &&
    Number.isFinite(command.amount) &&
    command.amount > 0 &&
    typeof command.fingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(command.fingerprint) &&
    typeof command.idempotencyKey === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      command.idempotencyKey,
    ) &&
    JSON.stringify(parsed) === value
  );
}

function isPendingReviewCommand(value: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }

  const command = parsed as Partial<PendingReviewCommand>;
  const keys = Object.keys(parsed).sort();
  if (
    keys.join(",") !== "action,key,note,version" ||
    (command.action !== "convert" && command.action !== "reject") ||
    !Number.isSafeInteger(command.version) ||
    (command.version as number) < 0 ||
    typeof command.note !== "string" ||
    typeof command.key !== "string" ||
    !new RegExp(`^sales-pr-${command.action}-[a-z0-9-]{8,256}$`).test(
      command.key,
    )
  ) {
    return false;
  }

  // This also rejects duplicate JSON members and non-JSON command extensions.
  return JSON.stringify(parsed) === value;
}
