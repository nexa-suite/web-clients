import { NexaCommandRetryStore } from "@nexa/api";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";

export interface CatalogCommandRetryIdentity {
  readonly key: string;
  readonly storageKey: string;
}

export async function catalogCommandRetryIdentity(
  retries: NexaCommandRetryStore,
  sessions: PlatformSessionStore,
  lease: PlatformSessionLease,
  intent:
    | "create-category"
    | "create-brand"
    | "create-variant"
    | "create-price",
  resourceId: string,
  request: object,
): Promise<CatalogCommandRetryIdentity | null> {
  if (!resourceId.trim() || !sessions.isSessionLeaseCurrent(lease)) return null;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle?.digest || !cryptoApi.randomUUID) return null;

  const digest = await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(request)),
  );
  if (!sessions.isSessionLeaseCurrent(lease)) return null;

  const payloadHash = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const { userId, tenantId, workspaceId, membershipId } = lease.scope;
  const storageKey = `nexa:platform:catalog-command:${[
    userId,
    tenantId,
    workspaceId,
    membershipId,
    intent,
    resourceId,
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
