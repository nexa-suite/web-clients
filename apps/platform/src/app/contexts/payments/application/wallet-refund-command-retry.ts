import { NexaCommandRetryStore, type WalletRefundRequest } from "@nexa/api";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";

export interface WalletRefundRetryIdentity {
  readonly key: string;
  readonly storageKey: string;
}

/** Persists only an opaque key scoped to one membership, order, and intent hash. */
export async function walletRefundRetryIdentity(
  retries: NexaCommandRetryStore,
  sessions: PlatformSessionStore,
  lease: PlatformSessionLease,
  salesOrderId: string,
  request: WalletRefundRequest,
): Promise<WalletRefundRetryIdentity | null> {
  if (!salesOrderId.trim() || !sessions.isSessionLeaseCurrent(lease))
    return null;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle?.digest || !cryptoApi.randomUUID) return null;

  const payload = {
    amountPEN: request.amountPEN,
    reason: request.reason,
  };
  const digest = await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  if (!sessions.isSessionLeaseCurrent(lease)) return null;

  const payloadHash = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const { userId, tenantId, workspaceId, membershipId } = lease.scope;
  const storageKey = `nexa:platform:wallet-refund:${[
    userId,
    tenantId,
    workspaceId,
    membershipId,
    salesOrderId,
    payloadHash,
  ]
    .map(encodeURIComponent)
    .join(":")}`;
  const existing = retries.read(storageKey);
  if (existing) return { key: existing, storageKey };

  const key = cryptoApi.randomUUID();
  retries.write(storageKey, key);
  return { key, storageKey };
}
