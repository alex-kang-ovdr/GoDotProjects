# Hub Google account and operator Drive integration

Status: code integration tested with mocks; real OAuth, Drive uploads and live deployment NOT completed.

## Local implementation update — 2026-11-18

Google login now returns to the original game path, query and fragment after success, cancellation or a validated provider failure. Failed login preserves the guest session and saved progress. Invalid, expired or replayed OAuth state remains an error instead of redirecting to an untrusted destination. Guest-save merging and historical analytics consent remain separate.

The server accepts these optional process environment overrides in addition to the existing private `google` configuration:

- `PLAYHUB_GOOGLE_CLIENT_ID`
- `PLAYHUB_GOOGLE_CLIENT_SECRET`
- `PLAYHUB_GOOGLE_REDIRECT_URI`

Do not put the client secret in `hub/web/user/config.js`, source control or command-line arguments. Partial credentials fail startup with a message that does not include their values. With no credentials, browsing and guest play remain available and the account screen explains that Google login is not configured.

For a future real-account local check, register a Google **Web application** OAuth client and the exact callback `http://localhost:8090/api/auth/google/callback`; use `http://localhost:8080` for the user site. The site and callback must use the same hostname: do not mix `localhost` and `127.0.0.1`. Callback queries, fragments, embedded credentials and alternate paths are rejected. Remote deployments require HTTPS for the site, callback and all allowed user origins, plus secure cookies. The Forge integration still requires its existing HTTPS profile even during local development; no insecure creator authentication fallback was added.

Implementation reference: [Google OpenID Connect server flow](https://developers.google.com/identity/openid-connect/openid-connect). Tests use locally signed mock ID tokens and temporary data; this does not validate a real consent screen, operator account or Google service availability. The user selected local implementation and automated verification for this change, so production settings and deployment were not changed.

## Local administrator sign-in

`admin.localAutoLogin` defaults to `false`. Set it to `true` in private `hub/config/local.json` if you want `tools\Run_Hub.bat` on Windows to open the administration page without asking for a password. The administrator page and API must use loopback addresses, and `adminBaseUrl` must be an HTTP origin on the configured administrator UI port. If no administrator name is configured, the local session uses `admin`.

The launcher passes a single-use link that expires after 60 seconds. The page clears the token from the address bar before exchanging it for an administrator cookie with CSRF protection. Opening the plain administrator URL in a fresh browser session uses the normal sign-in screen. `PLAYHUB_NO_BROWSER=1` starts the service without opening a browser or issuing a link. Set the option back to `false` and restart to return to password sign-in. Use `hub/tools/setup.mjs` to configure a password if this installation does not already have one.

## Creator metadata review

`/?view=create` uses the Hub session to list owned Forge projects and releases, inspect archive status and create a metadata review draft. `/?view=account` exposes login/guest record choices; `/?view=wishlist` retains the existing My Games URL; `/?view=browse` provides genre, device and control filters.

- `GET/POST /api/creator/submissions`: list owned submissions or create a draft from an owned immutable release.
- `GET/PATCH /api/creator/submissions/:id`: read or edit a draft/change request with its expected revision.
- `POST /api/creator/submissions/:id/submit`: request metadata review, with the expected revision.
- `GET /api/admin/submissions`: separate administrator queue, filtered by `status` and paged by `offset`.
- `POST /api/admin/submissions/:id/decision`: an authenticated administrator submits `revision`, `decision` (`changes_requested` or `approved`) and `note`. A change request requires a note.

States are `draft → in_review → changes_requested/approved`; change requests can be edited and resubmitted. Ownership is derived from the persisted Google binding. Mutations require CSRF and optimistic revisions. Administrator decisions have audit records. The additive `creator_submissions` SQLite table is accepted by the backup restoration schema checks, including compatibility with older snapshots without that table.

**Approval here means metadata approval only.** Responses explicitly report `publicationStatus: unpublished` and `packageValidation: not_verified`. No submitted code executes during review. No catalog entry, public version or package deployment is created by approval. Runnable-package validation, isolated previews, public release promotion, creator analytics and full Forge editor session integration remain separate work.

Local verification on Node 24.22.1: the combined backend/ownership/review/save/restore/config regression suite passed 115 tests, with one Windows symlink privilege test skipped. The headless Chrome site test covers navigation, filters, guest/creator access, login cancellation preserving path/query/hash, UUID draft display, CSRF-bearing draft creation, revision-bearing review submission and mobile overflow. Screenshots use fixture game/account data, not a real Google account. The static build completed with 21 catalog games. Logs and screenshots are under `hub/reports/local-site-*` (ignored generated output).

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

## Binary deployment ZIP archive (follow-up)
Enable `forge.builds.enabled` only on a controlled build worker with the correct Godot executable/export templates. Builds execute submitted project code during export; do not run an untrusted public multi-tenant build service without OS-level isolation, resource limits and operational controls. This change does not provision such isolation or start a build.

POST `/api/platform/projects/:id/builds` builds the current owned revision; GET `.../builds/:buildId` reads only that owner's status. Release creation with buildId requires a successful owned build, matching project revision/source hash and artifact SHA256. No shared legacy build directory is trusted.

Enable `forge.packages.enabled` and configure `forge.drive.packageFolderId` to a separate operator-owned app folder (different from snapshot folderId). POST `/api/platform/projects/:id/deployments/:releaseId` archives the server-side `PlayForge-Web.zip` for that owned release; GET reads status. No client-specified path, URL or bytes are accepted. Packages remain private and are not extracted, executed or published by the archive service.

ZIP checks enforce 64MiB compressed/128MiB expanded limits, safe paths, restricted web asset types, CRC, duplicates and format constraints; root index.html is required. The archive accepts the project's actual built ZIP, not a JSON surrogate. Remote bounded readback/hash validation is required for cloudVerified=true. Structural acceptance does not prove the game runs; runnableVerified remains false. Existing historical source-JSON submission route is separate.

Actual engine build, real Google OAuth and Drive transfer, browser gameplay and production rollout remain unverified. The runnable build path is implemented, not claimed tested with a real Godot export.
