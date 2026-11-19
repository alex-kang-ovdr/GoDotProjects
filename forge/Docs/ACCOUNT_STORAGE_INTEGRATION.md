# Account-scoped project storage

> **Integration status (2026-11-19):** Single-domain Hub Google login + process-separated Forge (`/forge/*` → `forge/server.cjs` with `hubAuth` verifying against Hub's loopback `POST /internal/session/verify`) is now the active integration path; see `docs/architecture/hub-forge-integration.md`. `forge/server.cjs` redirects `/PrivateAccount*` and `/account*` to Hub's `/?view=account`. `private-platform-server.cjs` remains a disabled-by-default legacy entry point kept for existing offline tests.

`Tools/account-platform-api.cjs` reuses the existing project API/version store in separate server-private directories keyed by SHA-256 of Google's canonical issuer + subject. Email changes do not move an account; user-supplied ownerId never chooses storage. Project files/history/restore/events are isolated by the selected account store. Existing shared projects are untouched; there is no automatic claim/migration.

The module requires a trusted asynchronous `verifyIdentity(req)` function. It deliberately has no fake Google login, header identity fallback, OAuth credential, or production registration. The test's mock session verifier is NOT a production login implementation.

Not yet connected to `server.cjs` or the public tunnel. Do not advertise existing shared endpoints as account-private. Before rollout: configure an owner-approved stable HTTPS origin and Google OAuth web client; validate Google signature/issuer/audience/expiry; exchange it for an HttpOnly/Secure server session; enforce CSRF/origin validation and logout/session expiry. Apply the same account checks to project builds, artifact downloads, published/private releases, collaboration WebSockets and all native execution routes, not only `/api/platform/`. Untrusted public code execution requires isolation separately.

PlayHub must use the same verified identity through a server-authenticated integration, never query-string user IDs or access tokens. No credentials or external OAuth configuration were created by this task. Personal Drive storage requires a separate server-only authorized owner adapter; local directories here do not implement Drive or a 100 GB quota.

Existing history retains 20 revisions. This is not durable unlimited version storage. Drive immutable snapshots and database manifests should be added before promising long-term history. Sharing/collaborator permissions and migration of shared projects require an explicit policy.

Validation: `node --test Tests/account-platform.test.cjs Tests/platform.test.cjs Tests/platform-service.test.cjs Tests/guided.test.cjs`.

## Offline implementation added

- `google-id-verifier.cjs`: fixed Google JWKS endpoint, RS256 signature, allowed issuer, client audience/authorized party, expiry/issued-at/not-before, subject and optional caller nonce. Bounded JWKS cache with retry throttling. No signing credentials are generated for production; tests create an ephemeral in-memory RSA fixture only.
- `private-platform-server.cjs`: separate opt-in account API entry point, **disabled by default**. Does not listen until explicitly started; never falls back to the original server. Bearer tokens only in Authorization, exact configured HTTPS Origin check, no CORS allowance. Shared project/build/native/export/static routes and WebSocket upgrades are not exposed. This is an API backend, not a completed browser login/session/signup flow.
- `/api/playhub/projects/:id/export`: authenticated owner-only export of an **enabled:false draft** matching existing WebGames/catalog.json fields. Does not copy builds or publish/update PlayHub. No cross-service token or account link is created. Artifact staging and operator-reviewed activation are still required.
- `drive-snapshot-store.cjs`: separate disabled Drive snapshot adapter; see DRIVE_SNAPSHOT_ADAPTER.md. It is not yet connected to project commits or the PlayHub export.

Existing public server/tunnel remains unchanged and is still the earlier shared prototype. Only the new private entry point has the fail-closed routing above. Do not claim the running prototype gained account protection. Before deployment, switch the approved routing and shut down/deny all old public endpoints; never mount this as a partial middleware in front of the legacy server.

Google verification reference: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token and https://accounts.google.com/.well-known/openid-configuration . Google recommends its maintained client library for production; the dependency-free implementation here has offline tests but not production audit, real-token rotation testing or login CSRF/session integration.

## Follow-up implementation: sessions and durable cloud outbox

The earlier "not connected" notes describe the first increment. Current code now supports these **explicit opt-in** connections in the separate private server, still without any production account/server activation:

- POST `/api/auth/challenge`: exact configured Origin required, returns a nonce and a short-lived HttpOnly/Secure/SameSite=Strict challenge cookie.
- POST `/api/auth/login`: JSON Google credential is verified against the consumed one-time nonce; exchanges it for a server-side opaque session cookie. Sessions are capped by Google token expiry; duplicate cookies are rejected. Login rotates the old session. POST `/api/auth/logout` revokes the cookie session and closes its open streams. No ID/access tokens are persisted in browser storage by this API.
- Cookie-authenticated writes require exact Origin; Authorization bearer mode remains available for explicit API clients. Both modes close open responses at identity expiry. Session/challenge state is in memory, so server restart signs users out; this is deliberate fail-closed behavior, not cross-node session persistence.
- `projectSync` option accepts `ProjectDriveSync`. Account stores attach create/save/restore events to a private durable outbox. Upload failure does not roll back a successful local save and MUST NOT be shown as Drive success. GET `/api/platform/projects/:id/cloud/history` exposes revision status without raw Drive file IDs, POST `/cloud` syncs current snapshot, and POST `/cloud/retry/:revision` retries the stored immutable revision. All require project ownership.
- With `playHubDrafts:true` plus an explicit private draft directory, POST `/api/playhub/projects/:id/draft` atomically persists a disabled catalog draft for the current release. This does not modify PlayHub's live catalog, deploy a game build or establish Google SSO on PlayHub.

Durability limits: local save and outbox are two separate files, not one transaction. Process-local queues do not coordinate multiple Node processes. Restart retry is explicit; no background scheduler has been activated. Drive scopes, owner refresh-token lifecycle, quota enforcement, restore-from-cloud, publication artifact staging, a complete browser Google sign-in UI and real-account end-to-end tests remain outstanding. Use a transactional database and maintained identity library before production rollout.

Validation commands include `Tests/login-sessions.test.cjs`, `Tests/private-cloud-sync.test.cjs`, `Tests/playhub-draft-store.test.cjs`, `Tests/project-drive-sync.test.cjs` along with existing account/Google/Drive/private-server/platform tests. All external services are mocked in the new tests; production secrets are neither created nor used.


## Opt-in personal workspace UI and operational adapters

`accountUi:true` exposes only `/account`, `/account/app.js`, `/account/style.css` and a non-secret `/api/auth/config` on the separate private server. This is not enabled on the existing public prototype. The Korean responsive UI loads Google GIS only after a login click, uses a server nonce challenge and HttpOnly session, lists/creates own projects, shows cloud history, requests sync, and stages disabled PlayHub drafts. A release must already exist before staging. It does not yet provide the full editor/release workflow and deliberately does not navigate into the legacy shared editor. Credentials are not stored in browser storage.

A real HTTPS origin and registered Google web OAuth client are needed to validate GIS popup/cookie/CSP behavior end to end. UI asset and security tests are automated; actual Google login and browser visual acceptance are not yet verified. `accountUi` alone can render a disabled setup screen without enabling account APIs.

Operator token refresh and pure quota/retention planning are documented in OPERATOR_OAUTH_RETENTION.md. They remain opt-in components, not active credentials or an enforced production quota ledger. Immutable snapshot records avoid reliance on Drive revision retention. No deletion, account consent, cloud deployment, production secret creation or push was performed.

Verification: 49 related Node tests passed (account isolation, ID token verifier, sessions, Drive snapshots/journal, private gateway, cloud sync, PlayHub drafts, UI whitelist, operator refresh and retention planning). Git status from the sandbox could not resolve the parent worktree; no Git mutation was attempted.
