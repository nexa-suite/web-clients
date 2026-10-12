import { NexaCommandRetryStore } from "@nexa/api";
import type { ConfigureCreditAccountRequest } from "@nexa/api";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";

export interface CreditConfigurationRetryIdentity {
  readonly key: string;
  readonly storageKey: string;
}

/** Persists only an opaque idempotency key, scoped to one membership and intent hash. */
export async function creditConfigurationRetryIdentity(
  retries: NexaCommandRetryStore,
  sessions: PlatformSessionStore,
  lease: PlatformSessionLease,
  clientAccountId: string,
  request: ConfigureCreditAccountRequest,
  precondition: { readonly ifNoneMatch: "*" } | { readonly ifMatch: string },
): Promise<CreditConfigurationRetryIdentity | null> {
  if (!sessions.isSessionLeaseCurrent(lease)) return null;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle?.digest || !cryptoApi.randomUUID) return null;

  const digest = await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ request, precondition })),
  );
  if (!sessions.isSessionLeaseCurrent(lease)) return null;

  const payloadHash = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const { userId, tenantId, workspaceId, membershipId } = lease.scope;
  const storageKey = `nexa:platform:credit-configuration:${[
    userId,
    tenantId,
    workspaceId,
    membershipId,
    clientAccountId,
    request.currency,
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
