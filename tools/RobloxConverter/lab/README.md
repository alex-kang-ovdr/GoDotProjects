# Roblox → Godot Converter Lab v0.1

## Run
Open `index.html` in a modern browser. No installation or network required. Alternatively run `python -m http.server 8000` in this folder and open http://localhost:8000.

## Scope
- Basic Luau expression/assignment conversion to GDScript (heuristic, NOT AST).
- Partial Roblox XML Item inventory to a Godot scene stub.
- API mapping trace and warnings for unsupported platform features.
- Download `.gd`, `.tscn`, or JSON manifest.

## Important limitations
- Generated code may not parse or run without edits. The sample Touched callback is a placeholder and not a working signal binding.
- XML output is **not** a faithful scene conversion; it flattens hierarchy and omits mesh, physics, transforms, scripts, and properties.
- No binary RBXL/RBXM, no asset fetching, no Luau VM, no runtime parity tests.
- For production: use rbx-dom for parsing, a Luau AST parser, typed IR, and Godot headless validation.
