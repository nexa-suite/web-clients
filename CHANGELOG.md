# Changelog

## Unreleased

## [0.3.0](docs/releases/v0.3.0.md) — local checkpoint candidate, unpublished

Prepared locally on 2026-10-28 from `feature/academic-checkpoint` at commit `fa341ad666b7eb5873dc3792c26936a8923c4ca3`. Version metadata is preparatory only. As of this preparation, no `v0.3.0` tag or GitHub Release exists; no publication was performed here.

### Scope recorded in this snapshot

- Add grant- and scope-aware Platform workflows for customer accounts and addresses, catalog administration, and Sales review of proposed Purchase Request changes.
- Add organization-registration drafts and activation requests. Final submission remains unavailable until an authorized legal-terms publication is configured; a request does not provision an immediately usable Tenant.
- Extend Buyer Portal catalog consultation with server-backed brand/category references and public product imagery, and let Buyers review and answer proposed Purchase Request changes.
- Preserve pending Buyer SKU selections while draft saves are in flight; add regression coverage for changed and newly selected lines.
- Add scoped Platform inventory consultation and inbound receiving, with optional Warehouse-scoped photo evidence that must reach scanner status `AVAILABLE` before receipt submission.
- Refresh visible order and delivery projections; expose Buyer live location only for an active scoped Delivery and when map-provider configuration is supplied.
- Derive navigation and actions from API-issued permissions and preserve command identity and payload across uncertain retries.
- Defer the Buyer Favorites page and route in the latest checkpoint; this snapshot does not claim a supported end-to-end Favorites workflow.

### Limits

The repository's `docs/quality/web-us-ac-closure.md` records functional closure as open and detailed acceptance criteria pending for 133 stories. That report references an earlier Web implementation commit (`0bd3add8214651ccdeab73ab14976730fd7ef85d`) and was not refreshed against this candidate or the live Blueprint during preparation. It is repository-recorded context, not current Product acceptance evidence. No Product/UX Acceptance, System Acceptance, deployment, or Production Readiness is claimed here.

## [0.2.0] - 2026-10-12

Source-only Web release for controlled local Nexa Suite testing. See the [release notes](docs/releases/v0.2.0.md) for included workflows, hosted evidence and limits. The signed tag and corresponding GitHub Release identify the published source; this entry does not claim deployment or production readiness.

- Extend Buyer Portal with supplier-scoped wallet balance, recharge and wallet order tender over authoritative API contracts.
- Add BOM credit configuration with explicit currency, concurrency and idempotency requirements.
- Add Company Owner and Tenant Administrator Warehouse grants for the verified workflow actor; keep human membership administration separate.
- Add internal onboarding and scoped read-only support under Tenant Access Governance.
- Enforce public context boundaries and server-provided capabilities in shell navigation.
- Remove Stripe return credentials before application startup and exclude query strings and referrers from application access logs.

## [0.2.0-alpha.1] - 2026-10-10

Source checkpoint prerelease; incomplete integration and distribution gates. See [checkpoint notes](docs/releases/v0.2.0-alpha.1.md).
