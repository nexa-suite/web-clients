export interface PurchaseRequestDraftLineInput {
  readonly skuId: string;
  readonly quantity: number;
  readonly unit?: string | null;
  readonly notes?: string | null;
}

export interface PurchaseRequestDraftLine {
  readonly id: string;
  readonly skuId: string;
  readonly skuCode: string;
  readonly presentation: string | null;
  readonly quantity: number | string;
  readonly unit: string | null;
  readonly baseUnitPrice: number | string;
  readonly effectiveUnitPrice: number | string;
  readonly discountAmount: number | string;
  readonly currency: string;
  readonly notes: string | null;
}

export interface PurchaseRequestDraftDestination {
  readonly addressId: string;
  readonly snapshot: string;
  readonly schemaVersion: string;
}

export interface PurchaseRequestDraftRoute {
  readonly provider: string;
  readonly estimated: boolean;
  readonly snapshot: string;
  readonly schemaVersion: string;
  readonly calculatedAt: string;
}

export interface PurchaseRequestDraftWarehouseSelection {
  readonly warehouseId: string;
  readonly snapshot: string;
  readonly schemaVersion: string;
  readonly selectedAt: string;
}

export interface PurchaseRequestDraft {
  readonly id: string;
  readonly clientAccountId: string;
  readonly buyerMembershipId: string;
  readonly status: string;
  readonly version: number;
  readonly requestedDeliveryDate: string;
  readonly paymentPreference: string | null;
  readonly creditResult: string | null;
  readonly routeProvider: string | null;
  readonly lines: readonly PurchaseRequestDraftLine[];
  readonly destination: PurchaseRequestDraftDestination | null;
  readonly route: PurchaseRequestDraftRoute | null;
  readonly warehouseSelection: PurchaseRequestDraftWarehouseSelection | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
}

export interface PurchaseRequestDraftSummary {
  readonly id: string;
  readonly status: string;
  readonly version: number;
  readonly requestedDeliveryDate: string;
  readonly lineCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PurchaseRequestDraftPage {
  readonly items: readonly PurchaseRequestDraftSummary[];
  readonly page: number;
  readonly size: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface PurchaseRequestDraftReview {
  readonly draft: PurchaseRequestDraft;
  readonly productsComplete: boolean;
  readonly destinationComplete: boolean;
  readonly routeValidated: boolean;
  readonly commercialReviewComplete: boolean;
  readonly readyToSubmit: boolean;
  readonly missing: readonly string[];
}

export interface PurchaseRequestPage {
  readonly items: readonly PurchaseRequestSummary[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface PurchaseRequestSummary {
  readonly id: string;
  readonly code: string;
  readonly clientAccountId: string;
  readonly status: string;
  readonly priority: string;
  readonly requestedDeliveryDate: string;
  readonly lineCount: number;
  readonly version: number;
}

export interface PurchaseRequestLine {
  readonly id: string;
  readonly catalogItemId: string | null;
  readonly itemName: string | null;
  readonly presentation: string | null;
  readonly quantity: number | string;
  readonly unit: string | null;
  readonly unitPriceAmount: number | string | null;
  readonly unitPriceCurrency: string | null;
  readonly notes: string | null;
  readonly version: number;
}

export interface PurchaseRequestDetail extends Omit<PurchaseRequestSummary, "lineCount"> {
  readonly buyerMembershipId: string;
  readonly deliveryProfileSnapshot: string | null;
  readonly paymentOption: string | null;
  readonly comment: string | null;
  readonly reviewNote: string | null;
  readonly lines: readonly PurchaseRequestLine[];
  readonly expiresAt: string | null;
}

export interface SalesOrderPage {
  readonly items: readonly SalesOrder[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface SalesOrderLine {
  readonly catalogItemId: string | null;
  readonly itemName: string | null;
  readonly presentation: string | null;
  readonly quantity: number | string;
  readonly unit: string | null;
  readonly unitPriceAmount: number | string | null;
  readonly unitPriceCurrency: string | null;
  readonly lineSubtotal: number | string | null;
  readonly skuId: string | null;
  readonly familyId: string | null;
  readonly skuCode: string | null;
  readonly familyCode: string | null;
}

export interface SalesOrder {
  readonly id: string;
  readonly number: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly clientAccountId: string;
  readonly createdByMembershipId: string;
  readonly buyerMembershipId: string | null;
  readonly sourcePurchaseRequestId: string | null;
  readonly priority: string;
  readonly requestedDeliveryDate: string;
  readonly deliverySnapshot: string | null;
  readonly paymentOption: string | null;
  readonly notes: string | null;
  readonly currency: string;
  readonly total: number | string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt: string | null;
  readonly rejectedAt: string | null;
  readonly cancelledAt: string | null;
  readonly rejectionReason: string | null;
  readonly version: number;
  readonly lines: readonly SalesOrderLine[];
  readonly originType: string | null;
  readonly commercialCommitmentId: string | null;
}

export interface PurchaseRequestPageQuery {
  readonly status?: string;
  readonly page?: number;
  readonly size?: number;
  readonly sort?: string;
}

export interface SalesOrderPageQuery {
  readonly status?: string;
  readonly page?: number;
  readonly size?: number;
  readonly sort?: string;
}

export interface CreatePurchaseRequestDraftRequest {
  readonly clientAccountId: string;
  readonly requestedDeliveryDate: string;
}

export interface SetPurchaseRequestDraftPreferencesRequest {
  readonly paymentPreference: 'CREDIT_LINE' | 'BANK_TRANSFER' | 'CARD_STRIPE' | 'CASH' | 'CASH_ON_DELIVERY' | 'WALLET';
  readonly requestedDeliveryDate: string;
}
