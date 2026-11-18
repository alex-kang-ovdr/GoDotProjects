# Source ZIP packaging only

Run `python tools/build/package_source.py --version VERSION --output dist/PlayHub-Platform-Source-VERSION.zip` or the BAT wrapper. Existing output is never overwritten. ZIP CRC and every included file SHA256 are verified. SOURCE_MANIFEST.json contains file hashes/version/component states; SOURCE_ONLY.txt explicitly says it is not runnable.

Included roots: apps, games, engine (source only), docs, tools, tests plus selected root project files. Excludes node_modules, Saved, user data/storage/logs/session folders, config/local.json and other non-example JSON configs, .env files, credentials, archives, executables/DLLs, native maps, wasm/pck engine packages, OfficialGodot/vendor, caches and build outputs. Symlink directories/files are not traversed. Private-key/API-key-looking text stops packaging rather than silently shipping it. This denylist and signature check are defense-in-depth, not a proof that arbitrary source never contains secrets; review source before external distribution.

Hub Node24 and Forge Node22 are declared independently. Neither Node runtimes nor installed dependencies are packaged. Native/browser Godot engine payloads are NOT included. A source ZIP is not a production build, installer, complete offline bundle or successful independent runtime validation. No app code, operator config, game content or running process is modified by packaging.

Use --component hub, forge or game for independent SOURCE archives. Common tooling/docs are included, but the other component payloads are not. --component engine explicitly fails because no standalone engine package is supplied. Separate source archives are not standalone runnable bundles.

Exact source exceptions: `games/<game>/Source/Data/` includes design CSV/Markdown/XLSX (not operational user data), and `tools/build/` includes the packaging tools themselves. Other data/build directories remain excluded, including nested data/build under these exceptions.
