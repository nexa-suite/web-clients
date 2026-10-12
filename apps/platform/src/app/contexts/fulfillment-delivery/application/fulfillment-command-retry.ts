import { NexaCommandRetryStore } from "@nexa/api";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";

export interface FulfillmentRetryIdentity {
  readonly key: string;
  readonly storageKey: string;
}

/** Creates a retry identity scoped to the active membership and immutable command intent. */
export async function fulfillmentCommandRetryIdentity(
  retries: NexaCommandRetryStore,
  sessions: PlatformSessionStore,
  lease: PlatformSessionLease,
  fulfillmentId: string,
  action: string,
  etag: string,
  payload: unknown,
): Promise<FulfillmentRetryIdentity | null> {
  if (!sessions.isSessionLeaseCurrent(lease)) return null;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle?.digest || !cryptoApi.randomUUID) return null;

  const normalized = JSON.stringify({ ifMatch: etag, body: payload });
  const digest = await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  if (!sessions.isSessionLeaseCurrent(lease)) return null;

  const payloadHash = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const { userId, tenantId, workspaceId, membershipId } = lease.scope;
  const storageKey = `nexa:platform:fulfillment-command:${[
    userId,
    tenantId,
    workspaceId,
    membershipId,
    fulfillmentId,
    action,
    payloadHash,
  ]
    .map(encodeURIComponent)
    .join(":")}`;
  const prior = retries.read(storageKey);
  if (prior) return { key: prior, storageKey };

  const key = cryptoApi.randomUUID();
  retries.write(storageKey, key);
  return { key, storageKey };
}
