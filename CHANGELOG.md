# Changelog

## Unreleased

- Build public company registration through versioned server drafts and
  explicit activation requests. Final submission requires an authorized
  terms publication; no legal text or version is supplied by default.
- Add scoped customer account and delivery-address management, Buyer
  association and catalog consultation to Platform.
- Add catalog taxonomy, family, variant, SKU and price management with exact
  grants and conservative recovery for uncertain creation outcomes.
- Add Sales material-change proposals and API history with scoped retry
  identities; proposal text remains in memory only.
- Connect customer, purchase request, sales order and fulfillment navigation
  through current server permissions.
- Project navigation, direct-route guards and actionable links from the current
  scoped API membership permissions, retaining endpoint-specific Buyer and
  workforce role constraints.
- Correct responsive shell spacing and shared content gutters without changing
  the visual design. Keep access projection logic independent and testable.

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
