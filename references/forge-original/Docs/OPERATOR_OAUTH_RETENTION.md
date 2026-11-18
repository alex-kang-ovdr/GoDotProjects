# Operator OAuth refresh and Drive retention planning (disabled)

## Operator token provider

Tools/operator-oauth-token.cjs exports createOperatorOAuthToken. It is disabled unless enabled:true. Inject a server-only secretsProvider returning clientId/clientSecret/refreshToken from authorized secret storage. getAccessToken can be passed directly to DriveSnapshotStore. Requests use only https://oauth2.googleapis.com/token, POST form encoding, redirect:error and a timeout. Tokens are cached in memory until an early refresh boundary; concurrent requests share one refresh. invalidate/close prevents an in-flight refresh from restoring a revoked cache. Failures never return stale cached tokens. Errors and status exclude tokens, secret values and upstream descriptions. invalid_grant requires operator reauthorization, not automatic credential creation.

The code does not provision OAuth clients, request consent, store refresh tokens, refresh real accounts during tests, or persist returned token rotation. If the OAuth provider rotates refresh tokens, a separately approved secret-store update flow is required. OAuth scopes and ownership still need operator authorization; obtaining an access token is not proof of Drive folder permission. No runtime/public server activation was performed.

## Quota and retention

Tools/drive-retention-policy.cjs exports planDriveRetention, a pure DRY-RUN function. It has no fetch, filesystem or delete implementation. Supply recent server-obtained quota {limitBytes,usedBytes,observedAt}, where observedAt is epoch milliseconds, and version rows with createdAt in epoch milliseconds. Missing/unknown/stale quota blocks admission. Omitted Drive quota limits must NOT be interpreted as unlimited or 100 GB.

Plans retain at least keepLatest revisions independently per account/project, plus pinned, published, active-release, young and noncommitted snapshots. Candidates are review_retention suggestions, not executable delete instructions. Estimated reclaimed capacity is never included in upload admission; cleanup would need separate authorization and a fresh quota read. This planner does NOT atomically reserve quota, execute cleanup, enforce billing, or guarantee capacity under concurrent uploads. Use a transactional admission ledger before enabling multiple writes; this is not an operational 100 GB quota system.

No credentials/network/user-data deletion are used by the mock tests. These modules are not wired to the running public server.

References:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/drive/api/reference/rest/v3/about

Test: node --test Tests/operator-oauth-token.test.cjs Tests/drive-retention-policy.test.cjs
