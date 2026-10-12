# Changelog

## [0.2.0-alpha.1] - 2026-10-10

Source checkpoint prerelease; incomplete integration and distribution gates. See [checkpoint notes](docs/releases/v0.2.0-alpha.1.md).

## Unreleased — v0.2.0 candidate

- Extend Buyer Portal with supplier-scoped wallet balance, recharge and wallet order tender over authoritative API contracts.
- Add BOM credit configuration with explicit currency, concurrency and idempotency requirements.
- Add Company Owner and Tenant Administrator Warehouse grants for the verified workflow actor; keep human membership administration separate.
- Add internal onboarding and scoped read-only support under Tenant Access Governance.
- Enforce public context boundaries and server-provided capabilities in shell navigation.
- Remove Stripe return credentials before application startup and exclude query strings and referrers from application access logs.

Frozen source-release scope and remaining integration steps: see [v0.2.0 candidate notes](docs/releases/v0.2.0.md). The recorded build, design, unit, and runtime-security checks were run at Web HEAD `d9314c2`; the current source edits have not been revalidated as a whole. The matching hosted PR run has five checks pass and the browser integration check fails before scenarios on its old API pin. The locally updated API pin has not received a hosted rerun. Product/UX acceptance, connected-system acceptance and deployment evidence remain separate follow-on gates and are not claimed.
