import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
	NexaCompanyOwnerSupportConsentApi,
	type SupportRequestView,
} from "@nexa/api";
import {
	PlatformSessionStore,
	type PlatformSessionLease,
} from "../../application/public-api";
import { type Observable } from "rxjs";

const ACTIVE_STATUSES = new Set([
	"AWAITING_OWNER_CONSENT",
	"AWAITING_INDEPENDENT_APPROVAL",
	"APPROVED",
]);

@Component({
	selector: "platform-company-owner-support-consents",
	standalone: true,
	templateUrl: "./platform-company-owner-support-consents.component.html",
	styleUrl: "./tenant-access-governance-pages.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformCompanyOwnerSupportConsentsComponent {
	private readonly api = inject(NexaCompanyOwnerSupportConsentApi);
	private readonly sessions = inject(PlatformSessionStore);
	private readonly destroyRef = inject(DestroyRef);
	private generation = 0;
	private disposed = false;
	private observedScope = "";
	private observedAuthorization = false;

	protected readonly requests = signal<readonly SupportRequestView[]>([]);
	protected readonly loading = signal(false);
	protected readonly busyRequestId = signal("");
	protected readonly needsRefresh = signal(false);
	protected readonly message = signal("");

	protected readonly canManage = computed(() => {
		const current = this.sessions.state();
		return current.status === "authenticated" && current.session.surface === "PLATFORM" &&
			(current.session.membership?.roles ?? []).includes("COMPANY_OWNER") &&
			this.sessions.captureSessionLease() !== null;
	});

	constructor() {
		effect(() => {
			const lease = this.sessions.captureSessionLease();
			const authorized = this.canManage();
			const scope = lease ? `${lease.epoch}:${lease.scope.userId}:${lease.scope.tenantId}:${lease.scope.workspaceId}:${lease.scope.membershipId}` : "no-current-scope";
			if (scope === this.observedScope && authorized === this.observedAuthorization) return;
			this.observedScope = scope;
			this.observedAuthorization = authorized;
			const generation = ++this.generation;
			this.requests.set([]);
			this.message.set("");
			this.loading.set(false);
			this.busyRequestId.set("");
			this.needsRefresh.set(false);
			if (lease && authorized) this.load(lease, generation);
		});
		this.destroyRef.onDestroy(() => {
			this.disposed = true;
			this.generation++;
			this.requests.set([]);
		});
	}

	protected refresh(): void {
		const lease = this.sessions.captureSessionLease();
		if (!lease || !this.canManage()) return;
		this.load(lease, ++this.generation);
	}

	protected consent(request: SupportRequestView): void {
		if (request.status !== "AWAITING_OWNER_CONSENT" || !this.canManage()) return;
		if (this.needsRefresh()) return;
		this.run(request.id, this.api.consent(request.id));
	}

	protected revoke(request: SupportRequestView): void {
		if (!ACTIVE_STATUSES.has(request.status) || !this.canManage()) return;
		if (this.needsRefresh()) return;
		this.run(request.id, this.api.revoke(request.id));
	}

	protected canConsent(request: SupportRequestView): boolean {
		return this.canManage() && !this.needsRefresh() && request.status === "AWAITING_OWNER_CONSENT";
	}

	protected canRevoke(request: SupportRequestView): boolean {
		return this.canManage() && !this.needsRefresh() && ACTIVE_STATUSES.has(request.status);
	}

	private load(lease: PlatformSessionLease, generation: number): void {
		this.loading.set(true);
		this.message.set("");
		this.api.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
			next: (requests) => {
				if (!this.isCurrent(lease, generation)) return;
				this.requests.set(requests);
				this.loading.set(false);
				this.needsRefresh.set(false);
			},
			error: () => {
				if (!this.isCurrent(lease, generation)) return;
				this.loading.set(false);
				this.needsRefresh.set(true);
				this.message.set("Support consent could not be loaded for the current Company Owner context.");
			},
		});
	}

	private run(requestId: string, operation: Observable<SupportRequestView>): void {
		const lease = this.sessions.captureSessionLease();
		if (!lease || !this.canManage()) return;
		const generation = ++this.generation;
		this.busyRequestId.set(requestId);
		this.message.set("");
		operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
			next: () => {
				if (!this.isCurrent(lease, generation)) return;
				this.busyRequestId.set("");
				this.needsRefresh.set(true);
				this.load(lease, generation);
			},
			error: () => {
				if (!this.isCurrent(lease, generation)) return;
				this.busyRequestId.set("");
				this.needsRefresh.set(true);
				this.message.set("The request was not confirmed. Refresh to read the current server state.");
			},
		});
	}

	private isCurrent(lease: PlatformSessionLease, generation: number): boolean {
		return !this.disposed && generation === this.generation && this.canManage() &&
			this.sessions.isSessionLeaseCurrent(lease);
	}
}
