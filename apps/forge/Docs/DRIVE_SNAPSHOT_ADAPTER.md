# Drive immutable snapshot adapter (disabled, not connected)

Tools/drive-snapshot-store.cjs is a server-only implementation with mocked tests. It is NOT wired into the public server and has never used a real Google account. Default enabled=false fails before credentials or network access. Explicit enabled=true, an operator-authorized folderId, a server-only getAccessToken provider, and fetch are required. No secrets, refresh tokens, service accounts or folders are created by this code.

## Contract

1. The authenticated application obtains accountKey from the verified Google subject, not from request parameters.
2. Atomically reserve a version manifest row keyed by accountKey/projectId/revision in a durable database. Call allocateFileId(), persist its Google-generated ID and snapshot hash in that row BEFORE uploading. Only one writer may reserve the row. Never allocate a new ID merely because an upload timed out.
3. putSnapshot uses files.create with that reserved ID and metadata+JSON multipart. It never updates or deletes an existing snapshot. On HTTP 409 it validates the existing file's parent folder, account, project, revision and SHA256 before treating the request as a successful retry. A different payload under the same reserved ID conflicts.
4. Persist the returned hash, size and fileId in the committed version manifest. Do not return a Drive access token or directly accessible Drive URL to a browser.
5. getSnapshot validates metadata ownership/folder and the downloaded payload hash/length/schema. The application must still authorize account/project access and apply revision conflict checks before restoring it to local editing state.

Durable database reservation/locking and global quota accounting are NOT included here. Without that manifest, new IDs can create duplicate snapshots; do not claim global idempotency. The adapter never changes Drive sharing permissions. Keep the operator's folder private. Ordinary app users need Google sign-in, not access to the operator's Drive token.

## Limits and deployment gates

This first adapter accepts JSON snapshots up to 4 MiB and 512 text files, using multipart upload. Larger files need a separate resumable-upload implementation. No automatic destructive cleanup, unlimited history, 100 GB allocation guarantee, billing or quota enforcement is implemented. Drive HTTP errors and transient failures fail closed without silently falling back to a public/shared local project. Redacted errors intentionally omit upstream messages and tokens.

The operator still must authorize appropriate Drive access (prefer drive.file for app-created storage), supply and securely refresh their token, choose the private folder, implement a durable manifest and atomic capacity reservation, and verify real upload/restore before enabling. Client app routes, builds and collaboration require separate authorization. Google OAuth credentials and external settings were not modified.

Official references:
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://developers.google.com/workspace/drive/api/guides/create-file
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds
- https://developers.google.com/workspace/drive/api/guides/properties

Test: node --test Tests/drive-snapshot-store.test.cjs (mock fetch only; no account access).
