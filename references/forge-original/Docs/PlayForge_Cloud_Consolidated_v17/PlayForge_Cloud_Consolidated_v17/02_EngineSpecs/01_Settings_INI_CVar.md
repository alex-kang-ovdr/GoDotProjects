# INI / Console / CVar System — DESIGN

## Config sources and precedence
Engine defaults -> platform defaults -> project defaults -> device-profile defaults -> scalability defaults -> user settings -> command line -> runtime console, subject to per-CVar priority/allowed source and capability caps. These are logical layers, not unconditional last-writer-wins. Config source provenance must be queryable.

## CVar metadata
Name, stable ID, type (bool/int/float/string), default, help, flags (ReadOnly, Cheat, DeveloperOnly, ServerOnly), apply mode (Immediate, RenderSafePoint, ResourceRecreate, WorldRestart, ProcessRestart), valid range, source, revision. Atomic updates and thread-safe snapshots; renderer changes queued to render-safe points.

## Commands
`help`, `cvar.list`, `cvar.get r.VSync`, `cvar.set r.VSync 0`, `stat fps`, `stat unit`, `stat memory`, `stat net`, `viewmode lit`, `show collision`, `scalability set high`, `deviceprofile show`.
Console command registry is distinct from CVar registry. Untrusted UGC Lua cannot execute arbitrary console commands. Public client allows only whitelisted settings. Dedicated server admin commands require authentication.

## INI handling
Support sections, key/value, repeated +CVars entries, inheritance, comments, validation, diagnostics, deterministic merge and serialization. Do not apply startup-only backend selection during runtime.
