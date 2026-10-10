# Changelog

## Unreleased — v0.2.0 candidate

- Extend Buyer Portal with supplier-scoped wallet balance, recharge and wallet order tender over authoritative API contracts.
- Add BOM credit configuration with explicit currency, concurrency and idempotency requirements.
- Add Company Owner and Tenant Administrator Warehouse grants for the verified workflow actor; keep human membership administration separate.
- Add internal onboarding and scoped read-only support under Tenant Access Governance.
- Enforce public context boundaries and server-provided capabilities in shell navigation.
- Remove Stripe return credentials before application startup and exclude query strings and referrers from application access logs.

Local candidate verification: production builds of both libraries and applications, architecture/design checks, and 331 Angular unit tests and four payment-return/logging checks passed. Connected browser/device flows, final API compatibility, publication and deployment remain separate pending gates.
