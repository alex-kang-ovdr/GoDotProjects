# Hub Google account and operator Drive integration

Status: code integration tested with mocks; real OAuth, Drive uploads and live deployment NOT completed.

## One identity
The Hub Google OAuth callback and its persisted registered session are the integrated authority. `/api/platform/*` uses Hub's existing cookie and `X-CSRF-Token`, not the standalone Forge `/account` login or caller-provided owner IDs. Google subject maps to the same Forge accountKey; no automatic merge of existing local user data is performed. QA/guest sessions cannot access private Forge projects. Do not expose the legacy shared Forge server as an authenticated service.

## Runtime and private configuration
Node.js 24+ is required by Hub. Keep `hub/` and `forge/` as sibling components: the integrated Hub now imports Forge API modules. Independent Hub ZIPs must include or explicitly install the matched Forge API dependency. Existing source ZIPs predate these changes.

Hub's existing Google client configuration (clientId, clientSecret, redirectUri), consent screen, allowed callback and HTTPS origin must be configured by the operator. Enable `secureCookies: true`, HTTPS-only `userOrigins`, and add a `forge` object to PRIVATE Hub config:

```json
{"forge":{"enabled":true,"directory":"D:/PlayHubPrivate/forge","drive":{"enabled":true,"folderId":"OPERATOR_APP_FOLDER_ID"}}}
```

The private directory must be outside this source tree and every web/static root. Never add it to Git or a deployment ZIP. Drive token credentials are read only from the server process environment:
- PLAYHUB_DRIVE_CLIENT_ID
- PLAYHUB_DRIVE_CLIENT_SECRET
- PLAYHUB_DRIVE_REFRESH_TOKEN

These belong to the service operator's authorized Google account, NOT each end user's Drive. The operator must complete the supported Google consent flow with offline access and app-file scope; no secrets are accepted through public APIs or printed. No credentials were created, configured or transmitted by this change. A missing token yields service unavailable, not successful cloud storage. Drive disabled remains the default.

## Routes and semantics
Use Hub login/session/CSRF endpoints already present. `/api/platform/projects` provides per-account local versioned projects. `POST /api/platform/projects/:id/cloud` explicitly syncs; `GET .../cloud/history` lists remote status. Local saves can succeed while sync is pending/failed. Only cloudCommitted=true denotes confirmed Drive API upload.

`POST /api/platform/projects/:id/submissions/:releaseId` archives the authenticated owner's immutable release. GET returns its status. It rereads Drive bytes before cloudVerified=true. This is a <=4 MiB release-source JSON package, NOT a runnable deployment ZIP, not public publication, and not a game catalog update. Server uses saved release files, not uploaded caller files.

No production quota reservation/deletion policy is enabled. Earlier retention helper remains dry-run only. No native or WASM build, editor UI integration, real Google browser E2E, Drive account connection or production deployment was verified. Existing legacy standalone Forge account UI remains separate and should not be presented as the unified entry point.
