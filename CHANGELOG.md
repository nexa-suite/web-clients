# Changelog

## Unreleased

- Planned changes for the next release will be recorded here.

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
