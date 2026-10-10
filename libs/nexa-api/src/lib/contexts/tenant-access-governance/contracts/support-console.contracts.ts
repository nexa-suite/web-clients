export type SupportRequestStatus =
  | "AWAITING_OWNER_CONSENT"
  | "AWAITING_INDEPENDENT_APPROVAL"
  | "APPROVED"
  | "REVOKED"
  | "EXPIRED";

export interface SupportRequestView {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly resourceType: "SALES_ORDER";
  readonly resourceId: string;
  readonly requestedByOperatorId: string;
  readonly approvedByOperatorId: string | null;
  readonly status: SupportRequestStatus;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly version: number;
}

export interface CreateSupportRequest {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly salesOrderId: string;
  readonly expiresAt: string;
}

/** Strict minimized support result: no customer, delivery, note, or line fields. */
export interface SupportSalesOrderProjection {
  readonly status: string;
  readonly total: number;
  readonly currency: string;
  readonly version: number;
}

export interface InternalConsoleOnboardingHealth {
  readonly registrationId: string | null;
  readonly registrationStatus: string | null;
  readonly tenantId: string | null;
  readonly workspaceId: string | null;
  readonly provisioningStatus: "PENDING" | "LEASED" | "FAILED" | "READY" | null;
  readonly attemptCount: number | null;
  readonly registryLifecycleState: "UNBOUND" | "PROVISIONING" | "READY" | "SUSPENDED" | "FAILED" | null;
  readonly updatedAt: string;
}

export interface InternalOperatorCredential {
  readonly operatorId: string;
  readonly token: string;
}
