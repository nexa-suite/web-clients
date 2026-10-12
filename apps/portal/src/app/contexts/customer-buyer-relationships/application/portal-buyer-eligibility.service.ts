import { computed, inject, Injectable, signal } from "@angular/core";
import { NexaApiError, NexaBuyerRelationshipsApi } from "@nexa/api";
import type { CurrentBuyerAccountResponse } from "@nexa/api";
import { Observable, catchError, defer, map, of, switchMap } from "rxjs";
import {
  PortalSessionStore,
  type PortalSessionLease,
} from "../../tenant-access-governance/application/public-api";

export type PortalBuyerEligibilityResult =
  | "authorized"
  | "relationship-required"
  | "unauthenticated"
  | "invalidated"
  | "unavailable"
  | "stale";

interface BuyerAccountSnapshot {
  readonly lease: PortalSessionLease;
  readonly account: CurrentBuyerAccountResponse;
}

/** Revalidates the server-owned Buyer relationship for the active Portal membership. */
@Injectable({ providedIn: "root" })
export class PortalBuyerEligibilityService {
  private readonly buyerRelationshipsApi = inject(NexaBuyerRelationshipsApi);
  private readonly sessions = inject(PortalSessionStore);
  private readonly accountSnapshot = signal<BuyerAccountSnapshot | null>(null);

  readonly currentAccount = computed(() => {
    const snapshot = this.accountSnapshot();
    return snapshot && this.sessions.isSessionLeaseCurrent(snapshot.lease)
      ? snapshot.account
      : null;
  });

  checkCurrent(): Observable<PortalBuyerEligibilityResult> {
    return defer(() => {
      const lease = this.sessions.captureSessionLease();
      if (!lease) {
        this.accountSnapshot.set(null);
        return of(this.resultWithoutLease());
      }
      return this.loadAccount(lease, true);
    });
  }

  private loadAccount(
    lease: PortalSessionLease,
    allowRefresh: boolean,
  ): Observable<PortalBuyerEligibilityResult> {
    return this.buyerRelationshipsApi.getCurrentAccount().pipe(
      map((account) => {
        if (!this.sessions.isSessionLeaseCurrent(lease))
          return "stale" as const;
        const currentSession = this.sessions.session();
        if (!currentSession) return "stale" as const;
        const isPortalScoped = currentSession.surface === "PORTAL";
        if (!isPortalScoped || !currentSession.membership)
          return "stale" as const;
        const membership = currentSession.membership;
        if (!nonBlankString(membership.membershipId)) return "stale" as const;
        if (!validBuyerAccount(account)) {
          this.accountSnapshot.set(null);
          return "unavailable" as const;
        }
        const relationshipMatches =
          account.buyerMembershipId === membership.membershipId;
        if (!relationshipMatches) {
          this.accountSnapshot.set(null);
          return "relationship-required" as const;
        }
        this.accountSnapshot.set({ lease, account });
        return "authorized" as const;
      }),
      catchError((error: unknown) => {
        if (!this.sessions.isSessionLeaseCurrent(lease))
          return of("stale" as const);
        if (isUnauthenticated(error) && allowRefresh) {
          return this.sessions.refreshAfterUnauthorized(lease).pipe(
            switchMap((refreshedLease) => {
              if (!refreshedLease) {
                this.accountSnapshot.set(null);
                return of(this.resultWithoutLease());
              }
              return this.loadAccount(refreshedLease, false);
            }),
            catchError((refreshError: unknown) => {
              this.accountSnapshot.set(null);
              return of(
                resultForSessionState(this.sessions.state(), refreshError),
              );
            }),
          );
        }
        this.accountSnapshot.set(null);
        if (isContextInvalid(error)) {
          this.sessions.invalidateContextIfCurrent(lease);
          return of("invalidated" as const);
        }
        if (isRelationshipDenied(error))
          return of("relationship-required" as const);
        return of("unavailable" as const);
      }),
    );
  }

  private resultWithoutLease(): PortalBuyerEligibilityResult {
    return resultForSessionState(this.sessions.state());
  }
}

function validBuyerAccount(
  account: unknown,
): account is CurrentBuyerAccountResponse {
  if (!isRecord(account)) return false;
  const stringFields = [
    "id",
    "code",
    "businessName",
    "countryCode",
    "taxType",
    "taxValue",
    "status",
  ];
  if (!stringFields.every((field) => nonBlankString(account[field]) !== null))
    return false;
  const nullableStringFields = [
    "commercialName",
    "segment",
    "contactPerson",
    "contactEmail",
    "phone",
    "deliveryProfile",
    "paymentCondition",
  ];
  if (!nullableStringFields.every((field) => nullableString(account[field])))
    return false;
  return (
    nullableString(account["buyerMembershipId"]) &&
    typeof account["version"] === "number" &&
    Number.isFinite(account["version"])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlankString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof NexaApiError && error.kind === "unauthenticated";
}

function isContextInvalid(error: unknown): boolean {
  return (
    error instanceof NexaApiError &&
    error.kind === "forbidden" &&
    error.problem?.code === "ACCESS_CONTEXT_INVALID"
  );
}

function isRelationshipDenied(error: unknown): boolean {
  return (
    error instanceof NexaApiError &&
    (error.kind === "forbidden" || error.kind === "not-found")
  );
}

function resultForSessionState(
  state: ReturnType<PortalSessionStore["state"]>,
  error?: unknown,
): PortalBuyerEligibilityResult {
  if (
    state.status === "invalidated" ||
    (error instanceof NexaApiError && isContextInvalid(error))
  )
    return "invalidated";
  if (state.status === "authenticated" || state.status === "signing-out")
    return "stale";
  if (state.status === "error") {
    const stateError = "error" in state ? state.error : error;
    return isTransient(stateError) ? "unavailable" : "unauthenticated";
  }
  if (state.status === "loading" || state.status === "signing-in")
    return "stale";
  return "unauthenticated";
}

function isTransient(error: unknown): boolean {
  return (
    error instanceof NexaApiError &&
    ["network", "timeout", "server", "rate-limited", "http"].includes(
      error.kind,
    )
  );
}
