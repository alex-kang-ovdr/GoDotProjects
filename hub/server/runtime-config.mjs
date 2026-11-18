// OAuth credentials stay on the server; none of these fields belong in web config.
export function resolveRuntimeConfig(input, env = process.env) {
  const google = { ...input.google };
  for (const [field, name] of Object.entries({ clientId: 'PLAYHUB_GOOGLE_CLIENT_ID', clientSecret: 'PLAYHUB_GOOGLE_CLIENT_SECRET', redirectUri: 'PLAYHUB_GOOGLE_REDIRECT_URI' })) {
    if (env[name] !== undefined) google[field] = env[name];
  }
  const configured = Boolean(google.clientId || google.clientSecret);
  if (configured) {
    if (['clientId', 'clientSecret', 'redirectUri'].some(key => typeof google[key] !== 'string' || !google[key].trim())) {
      throw new Error('Google login requires clientId, clientSecret and redirectUri in private configuration or PLAYHUB_GOOGLE_* environment variables.');
    }
    let callback, site;
    try { callback = new URL(google.redirectUri); site = new URL(input.userBaseUrl); }
    catch { throw new Error('Google callback and userBaseUrl must be valid URLs.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
    if (callback.pathname !== '/api/auth/google/callback' || callback.search || callback.hash || callback.username || callback.password
      || !['http:', 'https:'].includes(callback.protocol) || callback.hostname !== site.hostname) {
      throw new Error('Google callback must use /api/auth/google/callback on the same hostname as userBaseUrl, without query, fragment or credentials.');
    }
    if (!local && (callback.protocol !== 'https:' || site.protocol !== 'https:' || input.secureCookies !== true
      || !Array.isArray(input.userOrigins) || input.userOrigins.some(origin => !origin.startsWith('https://')))) {
      throw new Error('Remote Google login requires HTTPS site/callback/origins and secureCookies.');
    }
  }
  return { ...input, google };
}
