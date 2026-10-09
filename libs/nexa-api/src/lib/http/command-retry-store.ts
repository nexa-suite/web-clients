import { DOCUMENT } from "@angular/common";
import { Injectable, inject } from "@angular/core";

const BUYER_SUBMIT_PREFIX = "nexa:buyer:purchase-request-submit:";
const PLATFORM_REVIEW_PREFIX = "nexa:platform:purchase-request-command:";
const PLATFORM_FULFILLMENT_PREFIX = "nexa.platform.fulfillment-start:";
const PLATFORM_ORDER_SUMMARY_PREFIX = "nexa:platform:order-summary-generation:";
const PLATFORM_FULFILLMENT_COMMAND_PREFIX = "nexa:platform:fulfillment-command:";
const BUYER_BANK_TRANSFER_PREFIX = "nexa:buyer:bank-transfer:";
const PLATFORM_MEMBER_INVITATION_PREFIX = "nexa:platform:member-invitation:";
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
    PLATFORM_FULFILLMENT_PREFIX,
    PLATFORM_ORDER_SUMMARY_PREFIX,
    PLATFORM_FULFILLMENT_COMMAND_PREFIX,
    BUYER_BANK_TRANSFER_PREFIX,
    PLATFORM_MEMBER_INVITATION_PREFIX,
  ].find((candidate) => key.startsWith(candidate));
  if (!prefix) return null;

  const expectedSegments = new Map([
    [BUYER_SUBMIT_PREFIX, 4],
    [PLATFORM_REVIEW_PREFIX, 4],
    [PLATFORM_FULFILLMENT_PREFIX, 6],
    [PLATFORM_ORDER_SUMMARY_PREFIX, 5],
    [PLATFORM_FULFILLMENT_COMMAND_PREFIX, 7],
    [BUYER_BANK_TRANSFER_PREFIX, 6],
    [PLATFORM_MEMBER_INVITATION_PREFIX, 5],
  ]).get(prefix);
  const segments = key.slice(prefix.length).split(":");
  if (segments.length !== expectedSegments) return null;
  if (
    (prefix === PLATFORM_FULFILLMENT_COMMAND_PREFIX || prefix === BUYER_BANK_TRANSFER_PREFIX || prefix === PLATFORM_MEMBER_INVITATION_PREFIX) &&
    !/^[a-f0-9]{64}$/.test(segments.at(-1) ?? "")
  ) return null;
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
  if (
    key.startsWith(PLATFORM_FULFILLMENT_PREFIX) ||
    key.startsWith(PLATFORM_ORDER_SUMMARY_PREFIX) ||
    key.startsWith(PLATFORM_FULFILLMENT_COMMAND_PREFIX) ||
    key.startsWith(BUYER_BANK_TRANSFER_PREFIX) ||
    key.startsWith(PLATFORM_MEMBER_INVITATION_PREFIX)
  ) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
  if (key.startsWith(PLATFORM_REVIEW_PREFIX)) {
    return isPendingReviewCommand(value);
  }
  return false;
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
