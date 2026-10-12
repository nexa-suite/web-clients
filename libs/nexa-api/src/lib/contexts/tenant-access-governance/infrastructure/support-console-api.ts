import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type {
  SupportRequestView,
} from "../contracts/support-console.contracts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function requireUuid(value: string): string {
	const normalized = value.trim();
	if (!UUID_PATTERN.test(normalized)) throw new TypeError("A valid UUID is required.");
	return normalized;
}
