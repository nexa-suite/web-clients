# Access recovery

`web-clients` publishes one public recovery interface. Token consumption lives
at `/reset-password/`; the optional request entry point lives at
`/forgot-password/`. Both use the existing Nexa API password-recovery contract:

- `POST /api/v1/auth/password-reset-requests`
- `POST /api/v1/auth/password-resets`

The recovery surface is an internal request value. It is not presented as a
user choice; the public founder flow sends `PLATFORM`, while the API continues
to preserve the `PORTAL` contract for buyer callers. The issued token remains
in memory only, is accepted from the URL fragment or query string and is
removed from the address bar before the form is shown. Fragment delivery is
preferred; query-string support preserves compatibility with the current API
delivery adapter while its migration is pending. The page does not write tokens
to browser storage, logs or outgoing links, and the document applies a
`no-referrer` policy.

The Pages workflow is configured to publish the static application under the
repository path, with the expected recovery route
`https://nexa-suite.github.io/web-clients/reset-password/`, and points its
runtime API configuration to the verified Render API origin. It also
materializes the sign-in and optional request routes so direct navigation from
the reset success state survives a Pages refresh. The deployed URL
and browser behavior remain unverified until the workflow completes and the
route is checked over HTTPS. The API must allow that exact HTTPS origin and keep
credentialed browser requests enabled for its existing security contract. The
password-reset email adapter must emit the token in the fragment before this
flow is accepted as production-ready.
