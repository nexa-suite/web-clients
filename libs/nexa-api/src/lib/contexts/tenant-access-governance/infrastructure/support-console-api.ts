import { HttpClient, HttpContext } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION, NEXA_REQUEST_POLICY } from "../../../http/nexa-http";
import type {
	CreateSupportRequest,
	InternalConsoleOnboardingHealth,
	InternalOperatorCredential,
	SupportRequestView,
	SupportSalesOrderProjection,
} from "../contracts/support-console.contracts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable({ providedIn: "root" })
export class NexaInternalSupportConsoleApi {
	private readonly http = inject(HttpClient);
	private readonly config = inject(NEXA_API_HTTP_CONFIGURATION);

	listOnboarding(credential: InternalOperatorCredential, limit = 50) {
		return this.http.get<readonly InternalConsoleOnboardingHealth[]>(
			`${this.config.apiBaseUrl}/internal/console/onboarding`,
			{ params: { limit: clampLimit(limit) }, context: internalContext(credential) },
		);
	}

	listRequests(credential: InternalOperatorCredential, limit = 50) {
		return this.http.get<readonly SupportRequestView[]>(
			`${this.config.apiBaseUrl}/internal/console/support-requests`,
			{ params: { limit: clampLimit(limit) }, context: internalContext(credential) },
		);
	}

	requestSupport(credential: InternalOperatorCredential, request: CreateSupportRequest) {
		return this.http.post<SupportRequestView>(
			`${this.config.apiBaseUrl}/internal/console/support-requests`,
			request,
			{ context: internalContext(credential) },
		);
	}

	approve(credential: InternalOperatorCredential, requestId: string) {
		return this.http.post<SupportRequestView>(
			`${this.config.apiBaseUrl}/internal/console/support-requests/${encodeURIComponent(requireUuid(requestId))}/approval`,
			null,
			{ context: internalContext(credential) },
		);
	}

	revoke(credential: InternalOperatorCredential, requestId: string) {
		return this.http.post<SupportRequestView>(
			`${this.config.apiBaseUrl}/internal/console/support-requests/${encodeURIComponent(requireUuid(requestId))}/revocation`,
			null,
			{ context: internalContext(credential) },
		);
	}

	readSalesOrder(credential: InternalOperatorCredential, requestId: string) {
		return this.http.get<SupportSalesOrderProjection>(
			`${this.config.apiBaseUrl}/internal/console/support-requests/${encodeURIComponent(requireUuid(requestId))}/sales-order`,
			{ context: internalContext(credential) },
		);
	}
}

@Injectable({ providedIn: "root" })
export class NexaCompanyOwnerSupportConsentApi {
	private readonly http = inject(HttpClient);
	private readonly config = inject(NEXA_API_HTTP_CONFIGURATION);

	list() {
		return this.http.get<readonly SupportRequestView[]>(
			`${this.config.apiBaseUrl}/tenant/support-consents`,
		);
	}

	consent(requestId: string) {
		return this.http.post<SupportRequestView>(
			`${this.config.apiBaseUrl}/tenant/support-consents/${encodeURIComponent(requireUuid(requestId))}`,
			null,
		);
	}

	revoke(requestId: string) {
		return this.http.post<SupportRequestView>(
			`${this.config.apiBaseUrl}/tenant/support-consents/${encodeURIComponent(requireUuid(requestId))}/revocation`,
			null,
		);
	}
}

function internalContext(credential: InternalOperatorCredential): HttpContext {
	const operatorId = requireUuid(credential.operatorId);
	const token = credential.token.trim();
	if (!token) throw new TypeError("Internal operator token is required.");
	return new HttpContext().set(NEXA_REQUEST_POLICY, {
		omitBearer: true,
		headers: {
			"X-Nexa-Internal-Operator-Id": operatorId,
			"X-Nexa-Internal-Operator-Token": token,
		},
	});
}

function requireUuid(value: string): string {
	const normalized = value.trim();
	if (!UUID_PATTERN.test(normalized)) throw new TypeError("A valid UUID is required.");
	return normalized;
}

function clampLimit(value: number): number {
	if (!Number.isInteger(value) || value < 1) return 1;
	return Math.min(value, 100);
}
