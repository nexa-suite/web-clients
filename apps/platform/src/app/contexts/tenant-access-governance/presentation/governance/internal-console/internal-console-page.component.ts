import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
	NexaInternalSupportConsoleApi,
	type InternalConsoleOnboardingHealth,
	type InternalOperatorCredential,
	type SupportRequestView,
	type SupportSalesOrderProjection,
} from "@nexa/api";
import { forkJoin, type Observable } from "rxjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_REQUEST_STATUSES = new Set([
	"AWAITING_OWNER_CONSENT",
	"AWAITING_INDEPENDENT_APPROVAL",
	"APPROVED",
]);

interface UncertainCreate {
	readonly operatorId: string;
	readonly tenantId: string;
	readonly workspaceId: string;
	readonly salesOrderId: string;
	readonly expiresAt: string;
}

@Component({
	selector: "nexa-internal-console-page",
	standalone: true,
	templateUrl: "./internal-console-page.component.html",
	styleUrl: "./internal-console-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InternalConsolePageComponent {
	private readonly api = inject(NexaInternalSupportConsoleApi);
	private readonly destroyRef = inject(DestroyRef);
	private disposed = false;
	private credentialEpoch = 0;
	private requestsEpoch = 0;
	private uncertainCreate: UncertainCreate | null = null;
	protected readonly credential = signal<InternalOperatorCredential | null>(null);

	protected readonly operatorIdInput = signal("");
	protected readonly tokenInput = signal("");
	protected readonly onboarding = signal<readonly InternalConsoleOnboardingHealth[]>([]);
	protected readonly requests = signal<readonly SupportRequestView[]>([]);
	protected readonly loading = signal(false);
	protected readonly busyAction = signal("");
	protected readonly needsRefresh = signal(false);
	protected readonly message = signal("");
	protected readonly salesOrderResult = signal<SupportSalesOrderProjection | null>(null);
	protected readonly tenantIdInput = signal("");
	protected readonly workspaceIdInput = signal("");
	protected readonly salesOrderIdInput = signal("");
	protected readonly deadlineInput = signal("");
	protected readonly outcomeUnknown = signal(false);

	constructor() {
		this.destroyRef.onDestroy(() => {
			this.disposed = true;
			this.credentialEpoch++;
			this.requestsEpoch++;
			this.credential.set(null);
			this.tokenInput.set("");
			this.uncertainCreate = null;
		});
	}

	protected connect(event: Event): void {
		event.preventDefault();
		const operatorId = this.operatorIdInput().trim();
		const token = this.tokenInput().trim();
		if (!UUID_PATTERN.test(operatorId) || token.length === 0) {
			this.message.set(
				"Enter the allowlisted operator UUID and its internal token.",
			);
			return;
		}
		this.credentialEpoch++;
		this.requestsEpoch++;
		this.credential.set({ operatorId, token });
		this.operatorIdInput.set("");
		this.tokenInput.set("");
		this.onboarding.set([]);
		this.requests.set([]);
		this.salesOrderResult.set(null);
		this.loading.set(false);
		this.busyAction.set("");
		this.needsRefresh.set(false);
		this.message.set("");
		this.refresh();
	}

	protected clearCredentials(): void {
		this.credentialEpoch++;
		this.requestsEpoch++;
		this.credential.set(null);
		this.operatorIdInput.set("");
		this.tokenInput.set("");
		this.onboarding.set([]);
		this.requests.set([]);
		this.salesOrderResult.set(null);
		this.loading.set(false);
		this.busyAction.set("");
		this.needsRefresh.set(false);
		this.message.set(
			this.outcomeUnknown()
				? "Credentials cleared. The unresolved request remains paused; reconnect and refresh its server status before creating another request."
				: "Internal operator credentials cleared from this page.",
		);
	}

	protected setInput(
		field:
			| "operatorIdInput"
			| "tokenInput"
			| "tenantIdInput"
			| "workspaceIdInput"
			| "salesOrderIdInput"
			| "deadlineInput",
		event: Event,
	): void {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		this[field].set(target.value);
	}

	protected onboardingTrackKey(entry: InternalConsoleOnboardingHealth): string {
		return (
			entry.registrationId ??
			`tenant:${entry.tenantId ?? "unassigned"}:workspace:${entry.workspaceId ?? "unassigned"}`
		);
	}

	protected refresh(): void {
		const credential = this.credential();
		if (!credential || this.disposed) return;
		const epoch = this.credentialEpoch;
		const requestEpoch = ++this.requestsEpoch;
		this.loading.set(true);
		this.message.set("");
		forkJoin({
			onboarding: this.api.listOnboarding(credential),
			requests: this.api.listRequests(credential),
		})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (result) => {
					if (!this.isCurrent(epoch, requestEpoch)) return;
					this.onboarding.set(result.onboarding);
					this.requests.set(result.requests);
					this.loading.set(false);
					this.needsRefresh.set(false);
					if (this.outcomeUnknown()) {
						const matching = result.requests.some((request) =>
							this.matchesUnknownCreate(request),
						);
						if (matching) {
							this.outcomeUnknown.set(false);
							this.uncertainCreate = null;
							this.tenantIdInput.set("");
							this.workspaceIdInput.set("");
							this.salesOrderIdInput.set("");
							this.deadlineInput.set("");
							this.message.set(
								"The refreshed request list contains the submitted scope. Its server status is shown below.",
							);
						} else {
							this.message.set(
								"No matching request is visible yet. Keep creation paused and refresh again before submitting another request.",
							);
						}
					}
				},
				error: () => {
					if (!this.isCurrent(epoch, requestEpoch)) return;
					this.loading.set(false);
					this.needsRefresh.set(true);
					this.message.set(
						"Console refresh failed. Read the current server state before taking another action.",
					);
				},
			});
	}

	protected requestSupport(event: Event): void {
		event.preventDefault();
		const credential = this.credential();
		if (
			!credential ||
			this.loading() ||
			this.busyAction() ||
			this.needsRefresh() ||
			this.outcomeUnknown()
		)
			return;
		const tenantId = this.tenantIdInput().trim();
		const workspaceId = this.workspaceIdInput().trim();
		const salesOrderId = this.salesOrderIdInput().trim();
		const localDeadline = this.deadlineInput();
		if (
			![tenantId, workspaceId, salesOrderId].every((value) =>
				UUID_PATTERN.test(value),
			) ||
			!localDeadline
		) {
			this.message.set(
				"Enter the exact Tenant, Workspace, Sales Order UUIDs and expiry deadline.",
			);
			return;
		}
		const deadline = new Date(localDeadline);
		if (!Number.isFinite(deadline.valueOf())) {
			this.message.set("Enter a valid expiry deadline.");
			return;
		}
		const deadlineMs = deadline.valueOf();
		if (deadlineMs <= Date.now() || deadlineMs > Date.now() + 3_600_000) {
			this.message.set(
				"The consent deadline must be in the future and no more than one hour away.",
			);
			return;
		}
		const payload = {
			tenantId,
			workspaceId,
			salesOrderId,
			expiresAt: deadline.toISOString(),
		};
		this.uncertainCreate = { operatorId: credential.operatorId, ...payload };
		this.outcomeUnknown.set(true);
		this.salesOrderResult.set(null);
		this.runAction(
			"request",
			this.api.requestSupport(credential, payload),
			() => {
				this.uncertainCreate = null;
				this.tenantIdInput.set("");
				this.workspaceIdInput.set("");
				this.salesOrderIdInput.set("");
				this.deadlineInput.set("");
				this.outcomeUnknown.set(false);
				this.refresh();
			},
			() =>
				this.message.set(
					"Request outcome is uncertain. Refresh the request list before creating another grant.",
				),
		);
	}

	protected approve(request: SupportRequestView): void {
		const credential = this.credential();
		if (
			!credential ||
			this.needsRefresh() ||
			request.status !== "AWAITING_INDEPENDENT_APPROVAL" ||
			request.requestedByOperatorId === credential.operatorId
		)
			return;
		this.runAction(
			"approve:" + request.id,
			this.api.approve(credential, request.id),
			() => this.refresh(),
		);
	}

	protected revoke(request: SupportRequestView): void {
		const credential = this.credential();
		if (
			!credential ||
			this.needsRefresh() ||
			!ACTIVE_REQUEST_STATUSES.has(request.status) ||
			(request.requestedByOperatorId !== credential.operatorId &&
				request.approvedByOperatorId !== credential.operatorId)
		)
			return;
		this.runAction(
			"revoke:" + request.id,
			this.api.revoke(credential, request.id),
			() => this.refresh(),
		);
	}

	protected readOrder(request: SupportRequestView): void {
		const credential = this.credential();
		if (
			!credential ||
			this.needsRefresh() ||
			request.status !== "APPROVED" ||
			request.requestedByOperatorId !== credential.operatorId
		)
			return;
		this.runAction(
			"read:" + request.id,
			this.api.readSalesOrder(credential, request.id),
			(result) => {
				if (isSalesOrderProjection(result)) this.salesOrderResult.set(result);
			},
			() =>
				this.message.set(
					"The scoped read did not complete. Refresh and check the grant status.",
				),
		);
	}

	protected canApprove(request: SupportRequestView): boolean {
		return (
			request.status === "AWAITING_INDEPENDENT_APPROVAL" &&
			!this.needsRefresh() &&
			request.requestedByOperatorId !== this.credential()?.operatorId
		);
	}

	protected canRevoke(request: SupportRequestView): boolean {
		const operatorId = this.credential()?.operatorId;
		return Boolean(
			operatorId &&
			!this.needsRefresh() &&
			ACTIVE_REQUEST_STATUSES.has(request.status) &&
			(request.requestedByOperatorId === operatorId ||
				request.approvedByOperatorId === operatorId),
		);
	}

	protected canReadOrder(request: SupportRequestView): boolean {
		return (
			!this.needsRefresh() &&
			request.status === "APPROVED" &&
			request.requestedByOperatorId === this.credential()?.operatorId
		);
	}

	private runAction<T>(
		name: string,
		operation: Observable<T>,
		onSuccess: (result: T) => void,
		onFailure: () => void = () =>
			this.message.set(
				"Action failed. Refresh to read the server's current state.",
			),
	): void {
		const epoch = this.credentialEpoch;
		this.busyAction.set(name);
		this.message.set("");
		operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
			next: (result) => {
				if (!this.isCurrent(epoch)) return;
				this.busyAction.set("");
				if (!name.startsWith("read:")) this.needsRefresh.set(true);
				onSuccess(result);
			},
			error: () => {
				if (!this.isCurrent(epoch)) return;
				this.busyAction.set("");
				this.needsRefresh.set(true);
				onFailure();
			},
		});
	}

	private isCurrent(epoch: number, requestEpoch?: number): boolean {
		return (
			!this.disposed &&
			epoch === this.credentialEpoch &&
			(requestEpoch === undefined || requestEpoch === this.requestsEpoch)
		);
	}

	private matchesUnknownCreate(request: SupportRequestView): boolean {
		const pending = this.uncertainCreate;
		return (
			pending !== null &&
			request.requestedByOperatorId === pending.operatorId &&
			request.tenantId === pending.tenantId &&
			request.workspaceId === pending.workspaceId &&
			request.resourceId === pending.salesOrderId &&
			Date.parse(request.expiresAt) === Date.parse(pending.expiresAt)
		);
	}
}

function isSalesOrderProjection(
	value: unknown,
): value is SupportSalesOrderProjection {
	if (value === null || typeof value !== "object") return false;
	const projection = value as Partial<SupportSalesOrderProjection>;
	return (
		typeof projection.status === "string" &&
		typeof projection.currency === "string" &&
		typeof projection.total === "number" &&
		typeof projection.version === "number"
	);
}
